package feed

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/realbulls/ws-gateway/internal/config"
	"github.com/realbulls/ws-gateway/internal/model"
	"github.com/realbulls/ws-gateway/internal/store"
)

const kiteQuoteURL = "https://api.kite.trade/quote"

// Kite quote API accepts a bounded number of instruments per request.
const kiteMaxInstrumentsPerCall = 500

type Kite struct {
	manager     *Manager
	store       *store.Store
	apiKey      string
	symbols     []config.SymbolMap
	registryKey string
	poll        time.Duration
	client      *http.Client
}

func NewKite(manager *Manager, st *store.Store, apiKey string, symbols []config.SymbolMap, registryKey string, pollMS int) *Kite {
	poll := time.Duration(pollMS) * time.Millisecond
	if poll < 5*time.Second {
		poll = 30 * time.Second
	}
	return &Kite{
		manager:     manager,
		store:       st,
		apiKey:      apiKey,
		symbols:     symbols,
		registryKey: registryKey,
		poll:        poll,
		client:      &http.Client{Timeout: 12 * time.Second},
	}
}

func (k *Kite) Run(ctx context.Context) error {
	if k.apiKey == "" {
		return nil
	}
	ticker := time.NewTicker(k.poll)
	defer ticker.Stop()
	k.fetch(ctx)
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			k.fetch(ctx)
		}
	}
}

// targets builds the request keys to poll and a lookup table (both
// "EXCHANGE:TRADINGSYMBOL" and instrument_token -> internal symbol) used to
// map quote responses back to our symbols.
func (k *Kite) targets(ctx context.Context) (reqKeys []string, byKey map[string]string) {
	byKey = make(map[string]string)
	seen := make(map[string]struct{})

	addReq := func(key string) {
		if key == "" {
			return
		}
		if _, ok := seen[key]; ok {
			return
		}
		seen[key] = struct{}{}
		reqKeys = append(reqKeys, key)
	}

	for _, s := range k.symbols {
		if s.External == "" {
			continue
		}
		byKey[s.External] = s.Internal
		addReq(s.External)
	}

	reg, err := k.store.Registry(ctx, k.registryKey)
	if err == nil && reg != nil {
		for _, a := range reg.Assets {
			if a.InstrumentToken == "" && a.Tradingsymbol == "" {
				continue
			}
			key := ""
			if a.Exchange != "" && a.Tradingsymbol != "" {
				key = a.Exchange + ":" + a.Tradingsymbol
			}
			if key == "" {
				key = a.InstrumentToken
			}
			if key == "" || a.Symbol == "" {
				continue
			}
			byKey[key] = a.Symbol
			if a.InstrumentToken != "" {
				byKey[a.InstrumentToken] = a.Symbol
			}
			addReq(key)
		}
	}

	sort.Strings(reqKeys)
	return reqKeys, byKey
}

func (k *Kite) fetch(ctx context.Context) {
	token, err := k.store.GetStr(ctx, "zerodha:access_token")
	if err != nil || token == "" {
		return
	}

	reqKeys, byKey := k.targets(ctx)
	if len(reqKeys) == 0 {
		return
	}
	for start := 0; start < len(reqKeys); start += kiteMaxInstrumentsPerCall {
		end := start + kiteMaxInstrumentsPerCall
		if end > len(reqKeys) {
			end = len(reqKeys)
		}
		k.fetchChunk(ctx, token, reqKeys[start:end], byKey)
	}
}

func (k *Kite) fetchChunk(ctx context.Context, token string, keys []string, byKey map[string]string) {
	q := url.Values{}
	for _, key := range keys {
		q.Add("i", key)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, kiteQuoteURL+"?"+q.Encode(), nil)
	if err != nil {
		return
	}
	req.Header.Set("X-Kite-Version", "3")
	req.Header.Set("Authorization", "token "+k.apiKey+":"+token)

	resp, err := k.client.Do(req)
	if err != nil {
		return
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return
	}

	var parsed struct {
		Status string `json:"status"`
		Data   map[string]struct {
			LastPrice float64 `json:"last_price"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return
	}

	for instr, qd := range parsed.Data {
		internal, ok := byKey[instr]
		if !ok {
			for ext, in := range byKey {
				if strings.EqualFold(ext, instr) {
					internal, ok = in, true
					break
				}
			}
		}
		if !ok || qd.LastPrice <= 0 {
			continue
		}
		const halfSpread = 0.3 / 10000
		places := pricePlaces(internal)
		k.manager.Publish(ctx, model.Tick{
			Symbol: internal,
			Bid:    round(qd.LastPrice*(1-halfSpread), places),
			Ask:    round(qd.LastPrice*(1+halfSpread), places),
			Mid:    round(qd.LastPrice, places),
			Ts:     time.Now().UnixMilli(),
		})
	}
}
