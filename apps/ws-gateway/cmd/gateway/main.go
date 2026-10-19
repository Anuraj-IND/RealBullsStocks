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

var fallbackSeeds = []feed.Spec{
	{Symbol: "EURUSD", StartPrice: 1.085, AssetClass: "FOREX", QuoteCurrency: "USD"},
	{Symbol: "GBPUSD", StartPrice: 1.271, AssetClass: "FOREX", QuoteCurrency: "USD"},
	{Symbol: "USDJPY", StartPrice: 151.2, AssetClass: "FOREX", QuoteCurrency: "JPY"},
	{Symbol: "AUDUSD", StartPrice: 0.659, AssetClass: "FOREX", QuoteCurrency: "USD"},
	{Symbol: "XAUUSD", StartPrice: 2320, AssetClass: "COMMODITY", QuoteCurrency: "USD"},
	{Symbol: "XAGUSD", StartPrice: 27.4, AssetClass: "COMMODITY", QuoteCurrency: "USD"},
	{Symbol: "USOIL", StartPrice: 78.5, AssetClass: "COMMODITY", QuoteCurrency: "USD"},
	{Symbol: "AAPL", StartPrice: 214, AssetClass: "STOCK", QuoteCurrency: "USD"},
	{Symbol: "TSLA", StartPrice: 182, AssetClass: "STOCK", QuoteCurrency: "USD"},
	{Symbol: "NVDA", StartPrice: 118, AssetClass: "STOCK", QuoteCurrency: "USD"},
	{Symbol: "MSFT", StartPrice: 425, AssetClass: "STOCK", QuoteCurrency: "USD"},
	{Symbol: "US500", StartPrice: 5450, AssetClass: "INDEX", QuoteCurrency: "USD"},
	{Symbol: "NAS100", StartPrice: 19800, AssetClass: "INDEX", QuoteCurrency: "USD"},
	{Symbol: "NIFTY50", StartPrice: 24350, AssetClass: "INDEX", QuoteCurrency: "INR"},
	{Symbol: "BANKNIFTY", StartPrice: 52100, AssetClass: "INDEX", QuoteCurrency: "INR"},
	{Symbol: "SENSEX", StartPrice: 79900, AssetClass: "INDEX", QuoteCurrency: "INR"},
	{Symbol: "FINNIFTY", StartPrice: 23600, AssetClass: "INDEX", QuoteCurrency: "INR"},
	{Symbol: "RELIANCE", StartPrice: 2960, AssetClass: "STOCK", QuoteCurrency: "INR"},
	{Symbol: "TCS", StartPrice: 4120, AssetClass: "STOCK", QuoteCurrency: "INR"},
	{Symbol: "INFY", StartPrice: 1830, AssetClass: "STOCK", QuoteCurrency: "INR"},
	{Symbol: "HDFCBANK", StartPrice: 1685, AssetClass: "STOCK", QuoteCurrency: "INR"},
	{Symbol: "ICICIBANK", StartPrice: 1195, AssetClass: "STOCK", QuoteCurrency: "INR"},
	{Symbol: "SBIN", StartPrice: 815, AssetClass: "STOCK", QuoteCurrency: "INR"},
	{Symbol: "BHARTIARTL", StartPrice: 1540, AssetClass: "STOCK", QuoteCurrency: "INR"},
	{Symbol: "ITC", StartPrice: 442, AssetClass: "STOCK", QuoteCurrency: "INR"},
	{Symbol: "LT", StartPrice: 3580, AssetClass: "STOCK", QuoteCurrency: "INR"},
	{Symbol: "TATAMOTORS", StartPrice: 985, AssetClass: "STOCK", QuoteCurrency: "INR"},
}

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
		manager.Add(feed.NewKite(manager, st, cfg.ZerodhaKey, cfg.ZerodhaSymbols, cfg.RegistryKey, cfg.ZerodhaPollMS))
		log.Printf("zerodha feed: %d static symbols + registry (live once connected)", len(cfg.ZerodhaSymbols))
	}
	var synth *feed.Synthetic
	if cfg.SyntheticEnabled {
		specs := syntheticSpecs(ctx, st, cfg)
		synth = feed.NewSynthetic(manager, specs, cfg.TickThrottleMS)
		manager.Add(synth)
		log.Printf("synthetic feed: %d instruments", len(specs))
	}
	go manager.Start(ctx)
	if synth != nil {
		go refreshSynthetic(ctx, st, cfg, synth)
	}

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

func coveredSymbols(ctx context.Context, st *store.Store, cfg config.Config) map[string]struct{} {
	covered := map[string]struct{}{}
	for _, s := range cfg.BinanceSymbols {
		covered[strings.ToUpper(s)] = struct{}{}
	}
	if cfg.TwelveDataKey != "" {
		for _, s := range cfg.TwelveDataSymbols {
			covered[strings.ToUpper(s.Internal)] = struct{}{}
		}
	}
	if cfg.ZerodhaKey != "" {
		token, _ := st.GetStr(ctx, "zerodha:access_token")
		if token != "" {
			for _, s := range cfg.ZerodhaSymbols {
				covered[strings.ToUpper(s.Internal)] = struct{}{}
			}
			if reg, err := st.Registry(ctx, cfg.RegistryKey); err == nil && reg != nil {
				for _, a := range reg.Assets {
					if a.FeedSource == "kite" || a.InstrumentToken != "" {
						covered[strings.ToUpper(a.Symbol)] = struct{}{}
					}
				}
			}
		}
	}
	return covered
}

func registrySpecs(ctx context.Context, st *store.Store, cfg config.Config) []feed.Spec {
	reg, err := st.Registry(ctx, cfg.RegistryKey)
	if err != nil {
		log.Printf("registry read failed, using fallback seeds: %v", err)
	}
	if reg == nil || len(reg.Assets) == 0 {
		return fallbackSeeds
	}

	specs := make([]feed.Spec, 0, len(reg.Assets))
	priceBySym := make(map[string]float64, len(reg.Assets))
	for _, a := range reg.Assets {
		if a.StartPrice > 0 {
			priceBySym[strings.ToUpper(a.Symbol)] = a.StartPrice
		}
	}
	for _, a := range reg.Assets {
		if a.StartPrice <= 0 {
			continue
		}
		spec := feed.Spec{Symbol: strings.ToUpper(a.Symbol), StartPrice: a.StartPrice, AssetClass: a.AssetClass, QuoteCurrency: a.QuoteCurrency}
		if a.Underlying != "" {
			if up, ok := priceBySym[strings.ToUpper(a.Underlying)]; ok && up > 0 {
				spec.Underlying = strings.ToUpper(a.Underlying)
				spec.UnderlyingStartPrice = up
			}
		}
		specs = append(specs, spec)
	}
	if len(specs) == 0 {
		return fallbackSeeds
	}
	return specs
}

func syntheticSpecs(ctx context.Context, st *store.Store, cfg config.Config) []feed.Spec {
	return filterSpecs(registrySpecs(ctx, st, cfg), coveredSymbols(ctx, st, cfg))
}

// refreshSynthetic periodically re-reads the registry so instruments added at
// runtime (e.g. option contracts) receive synthetic quotes without a restart.
func refreshSynthetic(ctx context.Context, st *store.Store, cfg config.Config, synth *feed.Synthetic) {
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			synth.AddSpecs(syntheticSpecs(ctx, st, cfg))
		}
	}
}

func filterSpecs(in []feed.Spec, covered map[string]struct{}) []feed.Spec {
	out := make([]feed.Spec, 0, len(in))
	for _, s := range in {
		if _, skip := covered[strings.ToUpper(s.Symbol)]; skip {
			continue
		}
		out = append(out, s)
	}
	return out
}
