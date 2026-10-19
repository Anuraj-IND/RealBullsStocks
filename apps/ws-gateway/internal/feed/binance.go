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
}

func NewBinance(manager *Manager, symbols []string) *Binance {
	return &Binance{manager: manager, symbols: symbols}
}

type binanceEnvelope struct {
	Stream string          `json:"stream"`
	Data   json.RawMessage `json:"data"`
}

func (b *Binance) url() string {
	streams := make([]string, 0, len(b.symbols))
	for _, s := range b.symbols {
		streams = append(streams, s+"@bookTicker")
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
		bidStr, _ := fields["b"].(string)
		askStr, _ := fields["a"].(string)
		bid, err1 := strconv.ParseFloat(bidStr, 64)
		ask, err2 := strconv.ParseFloat(askStr, 64)
		if err1 != nil || err2 != nil || bid <= 0 || ask <= 0 {
			continue
		}
		b.manager.Publish(ctx, model.Tick{
			Symbol: strings.ToUpper(sym),
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
