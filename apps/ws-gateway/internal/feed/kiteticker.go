package feed

import (
	"context"
	"log"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	kiteticker "github.com/zerodha/gokiteconnect/v4/ticker"
	"github.com/zerodha/gokiteconnect/v4/models"

	"github.com/realbulls/ws-gateway/internal/model"
	"github.com/realbulls/ws-gateway/internal/store"
)

// KiteTicker streams live ticks over Kite's WebSocket (wss://ws.kite.trade):
// every exchange print, per instrument — true tick-by-tick for all Indian
// instruments (NSE/MCX cash, futures, options), replacing REST polling
// latency the same way Binance WS did for crypto.
//
// It subscribes (FULL mode) to the instrument tokens of every registry asset
// and resyncs the subscription every 30s, so newly added instruments join
// without a restart. The access token is re-read from Redis on every
// (re)connect, so the daily 6am token rotation recovers on its own.
// The API-side quote-bridge stays as gap-filler for anything dark.
type KiteTicker struct {
	manager     *Manager
	store       *store.Store
	apiKey      string
	registryKey string

	mu         sync.Mutex
	subscribed map[uint32]struct{}
	// Set while the WS is connected. The resync loop must never touch the
	// ticker while disconnected — Subscribe on a nil Conn panics inside
	// gorilla (no nil-check in gokiteconnect v4.4.3).
	connected atomic.Bool
}

func NewKiteTicker(manager *Manager, st *store.Store, apiKey, registryKey string) *KiteTicker {
	return &KiteTicker{
		manager:     manager,
		store:       st,
		apiKey:      apiKey,
		registryKey: registryKey,
		subscribed:  map[uint32]struct{}{},
	}
}

// tokens maps registry instrument tokens (numeric strings) to internal
// symbols for every asset that has one.
func (k *KiteTicker) tokens(ctx context.Context) map[uint32]string {
	out := map[uint32]string{}
	if k.apiKey == "" {
		return out
	}
	reg, err := k.store.Registry(ctx, k.registryKey)
	if err != nil || reg == nil {
		return out
	}
	for _, a := range reg.Assets {
		if a.Symbol == "" || a.InstrumentToken == "" {
			continue
		}
		n, err := strconv.ParseUint(a.InstrumentToken, 10, 32)
		if err != nil || n == 0 {
			continue
		}
		out[uint32(n)] = a.Symbol
	}
	return out
}

func (k *KiteTicker) Run(ctx context.Context) error {
	if k.apiKey == "" {
		return nil
	}
	backoff := time.Second
	for ctx.Err() == nil {
		token, err := k.store.GetStr(ctx, "zerodha:access_token")
		if err != nil || token == "" {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(10 * time.Second):
			}
			continue
		}
		serveErr := k.serve(ctx, token)
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if serveErr != nil {
			log.Printf("kite ticker error, retrying: %v", serveErr)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(backoff):
		}
		if backoff < 30*time.Second {
			backoff *= 2
		}
	}
	return ctx.Err()
}

func (k *KiteTicker) serve(ctx context.Context, token string) error {
	t := kiteticker.New(k.apiKey, token)
	t.SetAutoReconnect(true)
	t.SetReconnectMaxRetries(50)

	byToken := k.tokens(ctx)

	t.OnConnect(func() {
		k.connected.Store(true)
		k.mu.Lock()
		toks := make([]uint32, 0, len(byToken))
		for tok := range byToken {
			toks = append(toks, tok)
		}
		k.mu.Unlock()
		if len(toks) == 0 {
			return
		}
		if err := t.Subscribe(toks); err != nil {
			log.Printf("kite ticker subscribe failed: %v", err)
			return
		}
		if err := t.SetMode(kiteticker.ModeFull, toks); err != nil {
			log.Printf("kite ticker mode failed: %v", err)
			return
		}
		k.mu.Lock()
		k.subscribed = map[uint32]struct{}{}
		for _, tok := range toks {
			k.subscribed[tok] = struct{}{}
		}
		k.mu.Unlock()
		log.Printf("kite ticker live: %d instruments", len(toks))
	})

	t.OnTick(func(tick models.Tick) {
		k.mu.Lock()
		internal, ok := byToken[tick.InstrumentToken]
		k.mu.Unlock()
		if !ok || tick.LastPrice <= 0 {
			return
		}
		const halfSpread = 0.3 / 10000
		places := pricePlaces(internal)
		ts := tick.LastTradeTime.Time.UnixMilli()
		if ts <= 0 {
			ts = tick.Timestamp.Time.UnixMilli()
		}
		// Never stamp "now" without an exchange timestamp: a fresh ts on a
		// stale price defeats the STALE_QUOTE gate downstream. Skip instead —
		// the last honest snapshot keeps its real age.
		if ts <= 0 {
			return
		}
		k.manager.Publish(ctx, model.Tick{
			Symbol: internal,
			Bid:    round(tick.LastPrice*(1-halfSpread), places),
			Ask:    round(tick.LastPrice*(1+halfSpread), places),
			Mid:    round(tick.LastPrice, places),
			Ts:     ts,
		})
	})

	t.OnError(func(err error) {
		log.Printf("kite ticker error: %v", err)
	})
	t.OnClose(func(code int, reason string) {
		k.connected.Store(false)
		log.Printf("kite ticker closed: %d %s", code, reason)
	})

	// Resync subscriptions while connected: newly registered instruments
	// join live without waiting for a reconnect.
	stopResync := make(chan struct{})
	defer close(stopResync)
	go func() {
		tick := time.NewTicker(30 * time.Second)
		defer tick.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-stopResync:
				return
			case <-tick.C:
				if !k.connected.Load() {
					continue
				}
				fresh := k.tokens(ctx)
				var add []uint32
				k.mu.Lock()
				for tok := range fresh {
					if _, ok := k.subscribed[tok]; !ok {
						add = append(add, tok)
					}
					byToken[tok] = fresh[tok]
				}
				k.mu.Unlock()
				if len(add) > 0 {
					if err := t.Subscribe(add); err == nil {
						_ = t.SetMode(kiteticker.ModeFull, add)
					}
					k.mu.Lock()
					for _, tok := range add {
						k.subscribed[tok] = struct{}{}
					}
					k.mu.Unlock()
					log.Printf("kite ticker subscribed %d new instruments", len(add))
				}
			}
		}
	}()

	done := make(chan error, 1)
	go func() {
		t.Serve()
		done <- nil
	}()
	select {
	case <-ctx.Done():
		t.Stop()
		return ctx.Err()
	case err := <-done:
		return err
	}
}
