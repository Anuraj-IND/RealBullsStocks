package feed

import (
	"context"
	"encoding/json"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/websocket"

	"github.com/realbulls/ws-gateway/internal/model"
)

const binanceBase = "wss://stream.binance.com:9443/stream?streams="

type Binance struct {
	manager *Manager
	symbols []string
	// Last book quotes per symbol, so per-trade prints can publish a full
	// tick (real bid/ask + trade mid) without waiting for the next book move.
	lastBid map[string]float64
	lastAsk map[string]float64
}

func NewBinance(manager *Manager, symbols []string) *Binance {
	return &Binance{manager: manager, symbols: symbols, lastBid: map[string]float64{}, lastAsk: map[string]float64{}}
}

type binanceEnvelope struct {
	Stream string          `json:"stream"`
	Data   json.RawMessage `json:"data"`
}

func (b *Binance) url() string {
	streams := make([]string, 0, len(b.symbols)*2)
	for _, s := range b.symbols {
		streams = append(streams, s+"@bookTicker", s+"@aggTrade")
	}
	return binanceBase + strings.Join(streams, "/")
}

func (b *Binance) Run(ctx context.Context) error {
	if len(b.symbols) == 0 {
		return nil
	}
	backoff := time.Second
	for ctx.Err() == nil {
		err := b.connect(ctx)
		if ctx.Err() != nil {
			return ctx.Err()
		}
		println("binance feed error, retrying:", err.Error())
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

func (b *Binance) connect(ctx context.Context) error {
	conn, _, err := websocket.DefaultDialer.DialContext(ctx, b.url(), nil)
	if err != nil {
		return err
	}
	defer conn.Close()

	done := make(chan struct{})
	defer close(done)
	go func() {
		select {
		case <-ctx.Done():
			_ = conn.Close()
		case <-done:
		}
	}()

	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			return err
		}
		var env binanceEnvelope
		if err := json.Unmarshal(raw, &env); err != nil {
			continue
		}
		var fields map[string]interface{}
		if err := json.Unmarshal(env.Data, &fields); err != nil {
			continue
		}
		sym, _ := fields["s"].(string)
		sym = strings.ToUpper(sym)
		if sym == "" {
			continue
		}
		// aggTrade (every printed trade) carries "p"; bookTicker carries "b"/"a".
		if priceStr, ok := fields["p"].(string); ok {
			price, err := strconv.ParseFloat(priceStr, 64)
			if err != nil || price <= 0 {
				continue
			}
			bid, okBid := b.lastBid[sym]
			ask, okAsk := b.lastAsk[sym]
			if !okBid || !okAsk || bid <= 0 || ask <= 0 {
				bid, ask = price, price
			}
			ts := time.Now().UnixMilli()
			if t, ok := fields["T"].(float64); ok && t > 0 {
				ts = int64(t)
			}
			b.manager.Publish(ctx, model.Tick{
				Symbol: sym,
				Bid:    bid,
				Ask:    ask,
				Mid:    round(price, 8),
				Ts:     ts,
			})
			continue
		}
		bidStr, _ := fields["b"].(string)
		askStr, _ := fields["a"].(string)
		bid, err1 := strconv.ParseFloat(bidStr, 64)
		ask, err2 := strconv.ParseFloat(askStr, 64)
		if err1 != nil || err2 != nil || bid <= 0 || ask <= 0 {
			continue
		}
		b.lastBid[sym] = bid
		b.lastAsk[sym] = ask
		b.manager.Publish(ctx, model.Tick{
			Symbol: sym,
			Bid:    bid,
			Ask:    ask,
			Mid:    round((bid+ask)/2, 8),
			Ts:     time.Now().UnixMilli(),
		})
	}
}

func round(v float64, places int) float64 {
	p := math.Pow10(places)
	return math.Round(v*p) / p
}
