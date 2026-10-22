package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/realbulls/ws-gateway/internal/config"
	"github.com/realbulls/ws-gateway/internal/feed"
	"github.com/realbulls/ws-gateway/internal/server"
	"github.com/realbulls/ws-gateway/internal/store"
)

func main() {
	cfg := config.Load()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	st, err := store.New(ctx, cfg.RedisURL)
	if err != nil {
		log.Fatalf("redis connection failed: %v", err)
	}
	defer st.Close()
	_ = st.WaitReady(ctx)

	hub := server.NewHub(st)
	go func() {
		if err := hub.RunFanout(ctx, "ticks:*", "accounts:*", "notify:*"); err != nil && ctx.Err() == nil {
			log.Printf("fanout stopped: %v", err)
		}
	}()

	manager := feed.NewManager(st)
	if len(cfg.BinanceSymbols) > 0 {
		manager.Add(feed.NewBinance(manager, cfg.BinanceSymbols))
		log.Printf("binance feed: %s", strings.Join(cfg.BinanceSymbols, ","))
	}
	if cfg.TwelveDataKey != "" && len(cfg.TwelveDataSymbols) > 0 {
		manager.Add(feed.NewTwelveData(manager, cfg.TwelveDataKey, cfg.TwelveDataSymbols, cfg.TwelveDataPollMS))
		log.Printf("twelvedata feed: %d symbols (forex/india/commodities)", len(cfg.TwelveDataSymbols))
	}
	if cfg.ZerodhaKey != "" {
		manager.Add(feed.NewKiteTicker(manager, st, cfg.ZerodhaKey, cfg.RegistryKey))
		log.Printf("kite ticker: live WS ticks (registry-driven, auto-resubscribing)")
	}
	go manager.Start(ctx)

	srv := server.New(hub)
	log.Printf("ws-gateway listening on :%s", cfg.Port)

	errCh := make(chan error, 1)
	go func() { errCh <- srv.ListenAndServe(ctx, ":"+cfg.Port) }()

	select {
	case <-ctx.Done():
		log.Println("shutting down")
	case err := <-errCh:
		if err != nil {
			log.Fatalf("server error: %v", err)
		}
	}
	time.Sleep(100 * time.Millisecond)
}
