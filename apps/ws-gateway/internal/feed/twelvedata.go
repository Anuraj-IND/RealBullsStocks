package feed

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/realbulls/ws-gateway/internal/config"
	"github.com/realbulls/ws-gateway/internal/model"
)

const twelveDataURL = "https://api.twelvedata.com/quote"

type TwelveData struct {
	manager   *Manager
	apiKey    string
	symbols   []config.SymbolMap
	reverse   map[string]string
	pollEvery time.Duration
	client    *http.Client
	batchSize int
}

func NewTwelveData(manager *Manager, apiKey string, symbols []config.SymbolMap, pollMS int) *TwelveData {
	reverse := make(map[string]string, len(symbols))
	for _, s := range symbols {
		reverse[s.External] = s.Internal
	}
	poll := time.Duration(pollMS) * time.Millisecond
	if poll < 5*time.Second {
		poll = 15 * time.Second
	}
	return &TwelveData{
		manager:   manager,
		apiKey:    apiKey,
		symbols:   symbols,
		reverse:   reverse,
		pollEvery: poll,
		client:    &http.Client{Timeout: 12 * time.Second},
		batchSize: 30,
	}
}

func (t *TwelveData) Run(ctx context.Context) error {
	if t.apiKey == "" || len(t.symbols) == 0 {
		return nil
	}
	t.fetchAll(ctx)
	ticker := time.NewTicker(t.pollEvery)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			t.fetchAll(ctx)
		}
	}
}

func (t *TwelveData) fetchAll(ctx context.Context) {
	for start := 0; start < len(t.symbols); start += t.batchSize {
		end := start + t.batchSize
		if end > len(t.symbols) {
			end = len(t.symbols)
		}
		chunk := t.symbols[start:end]
		externals := make([]string, len(chunk))
		for i, s := range chunk {
			externals[i] = s.External
		}
		t.fetchBatch(ctx, externals)
	}
}

type tdQuote struct {
	Symbol        string `json:"symbol"`
	Close         string `json:"close"`
	PreviousClose string `json:"previous_close"`
	IsMarketOpen  bool   `json:"is_market_open"`
	Status        string `json:"status"`
	Code          int    `json:"code"`
	Message       string `json:"message"`
}

func (t *TwelveData) fetchBatch(ctx context.Context, externals []string) {
	q := url.Values{}
	q.Set("symbol", strings.Join(externals, ","))
	q.Set("apikey", t.apiKey)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, twelveDataURL+"?"+q.Encode(), nil)
	if err != nil {
		return
	}
	resp, err := t.client.Do(req)
	if err != nil {
		return
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(body, &raw); err != nil {
		return
	}
	if _, isSingle := raw["symbol"]; isSingle {
		var q tdQuote
		if json.Unmarshal(body, &q) == nil {
			t.publish(q)
		}
		return
	}
	for _, v := range raw {
		var q tdQuote
		if json.Unmarshal(v, &q) == nil && q.Symbol != "" {
			t.publish(q)
		}
	}
}

func (t *TwelveData) publish(q tdQuote) {
	internal, ok := t.reverse[q.Symbol]
	if !ok {
		for ext, in := range t.reverse {
			if strings.EqualFold(ext, q.Symbol) {
				internal, ok = in, true
				break
			}
		}
	}
	if !ok {
		return
	}
	mid, err := strconv.ParseFloat(strings.TrimSpace(q.Close), 64)
	if err != nil || mid <= 0 {
		return
	}
	const halfSpread = 0.5 / 10000
	places := pricePlaces(internal)
	t.manager.Publish(context.Background(), model.Tick{
		Symbol: internal,
		Bid:    round(mid*(1-halfSpread), places),
		Ask:    round(mid*(1+halfSpread), places),
		Mid:    round(mid, places),
		Ts:     time.Now().UnixMilli(),
	})
}
