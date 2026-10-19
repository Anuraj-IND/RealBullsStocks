package feed

import (
	"context"
	"math"
	"math/rand"
	"sync"
	"time"

	"github.com/realbulls/ws-gateway/internal/model"
)

type instrument struct {
	symbol        string
	price         float64
	drift         float64
	vol           float64
	assetClass    string
	quoteCurrency string
	underlying    string
	baseRatio     float64
	closedTicks   int
	open          bool
}

type Synthetic struct {
	manager       *Manager
	throttle      time.Duration
	halfSpreadBps float64
	insts         []*instrument
	mu            sync.Mutex
}

type Spec struct {
	Symbol               string
	StartPrice           float64
	Vol                  float64
	AssetClass           string
	QuoteCurrency        string
	Underlying           string
	UnderlyingStartPrice float64
}

func newInstrument(s Spec) *instrument {
	vol := s.Vol
	if vol <= 0 {
		vol = defaultVol(s.Symbol)
	}
	inst := &instrument{
		symbol:        s.Symbol,
		price:         s.StartPrice,
		vol:           vol,
		assetClass:    s.AssetClass,
		quoteCurrency: s.QuoteCurrency,
	}
	if s.Underlying != "" && s.UnderlyingStartPrice > 0 {
		inst.underlying = s.Underlying
		inst.baseRatio = s.StartPrice / s.UnderlyingStartPrice
	}
	return inst
}

func NewSynthetic(manager *Manager, specs []Spec, throttleMS int) *Synthetic {
	insts := make([]*instrument, 0, len(specs))
	for _, s := range specs {
		if s.StartPrice <= 0 {
			continue
		}
		insts = append(insts, newInstrument(s))
	}
	return &Synthetic{
		manager:       manager,
		throttle:      time.Duration(throttleMS) * time.Millisecond,
		halfSpreadBps: 1.5,
		insts:         insts,
	}
}

// AddSpecs appends newly discovered instruments (e.g. options added to the
// registry after startup) without duplicating existing symbols.
func (s *Synthetic) AddSpecs(specs []Spec) {
	s.mu.Lock()
	defer s.mu.Unlock()
	existing := make(map[string]struct{}, len(s.insts))
	for _, inst := range s.insts {
		existing[inst.symbol] = struct{}{}
	}
	for _, sp := range specs {
		if sp.StartPrice <= 0 {
			continue
		}
		if _, ok := existing[sp.Symbol]; ok {
			continue
		}
		s.insts = append(s.insts, newInstrument(sp))
		existing[sp.Symbol] = struct{}{}
	}
}

func defaultVol(symbol string) float64 {
	switch {
	case len(symbol) == 6 && symbol[3:] == "USD" && symbol[:3] != "XAU" && symbol[:3] != "XAG":
		return 0.08
	case symbol == "XAUUSD":
		return 0.14
	case symbol == "XAGUSD":
		return 0.22
	case symbol == "USOIL":
		return 0.35
	case symbol == "US500" || symbol == "NAS100":
		return 0.16
	default:
		return 0.30
	}
}

func (s *Synthetic) publishStatic(inst *instrument, ctx context.Context) {
	mid := round(inst.price, pricePlaces(inst.symbol))
	half := s.halfSpreadBps / 10000 / 2
	s.manager.Publish(ctx, model.Tick{
		Symbol: inst.symbol,
		Bid:    round(mid*(1-half), pricePlaces(inst.symbol)),
		Ask:    round(mid*(1+half), pricePlaces(inst.symbol)),
		Mid:    mid,
		Ts:     time.Now().UnixMilli(),
	})
}

func (s *Synthetic) Run(ctx context.Context) error {
	if s.throttle <= 0 {
		s.throttle = 250 * time.Millisecond
	}
	ticker := time.NewTicker(s.throttle)
	defer ticker.Stop()

	dt := s.throttle.Seconds() / (252 * 6.5 * 3600)
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			s.mu.Lock()
			now := time.Now()
			for _, inst := range s.insts {
				open := marketOpen(inst.assetClass, inst.quoteCurrency, now)
				if open && !inst.open {
					inst.open = true
					inst.closedTicks = 0
				}
				if !open && inst.open {
					inst.open = false
				}
				if !open {
					inst.closedTicks++
					if inst.closedTicks%12 == 0 {
						s.publishStatic(inst, ctx)
					}
					continue
				}
				if inst.underlying != "" {
					if up := s.manager.LastPrice(inst.underlying); up > 0 {
						inst.price = up * inst.baseRatio
						mid := round(inst.price, pricePlaces(inst.symbol))
						half := s.halfSpreadBps / 10000 / 2
						s.manager.Publish(ctx, model.Tick{
							Symbol: inst.symbol,
							Bid:    round(mid*(1-half), pricePlaces(inst.symbol)),
							Ask:    round(mid*(1+half), pricePlaces(inst.symbol)),
							Mid:    mid,
							Ts:     time.Now().UnixMilli(),
						})
						continue
					}
				}
				shock := rand.NormFloat64()
				inst.price *= math.Exp((inst.drift-0.5*inst.vol*inst.vol)*dt + inst.vol*math.Sqrt(dt)*shock)
				if inst.price <= 0 {
					inst.price = 0.0001
				}
				mid := round(inst.price, pricePlaces(inst.symbol))
				half := s.halfSpreadBps / 10000 / 2
				tick := model.Tick{
					Symbol: inst.symbol,
					Bid:    round(mid*(1-half), pricePlaces(inst.symbol)),
					Ask:    round(mid*(1+half), pricePlaces(inst.symbol)),
					Mid:    mid,
					Ts:     time.Now().UnixMilli(),
				}
				s.manager.Publish(ctx, tick)
			}
			s.mu.Unlock()
		}
	}
}

func pricePlaces(symbol string) int {
	switch symbol {
	case "USDJPY":
		return 3
	case "XAUUSD":
		return 2
	case "XAGUSD":
		return 3
	case "USOIL":
		return 2
	case "US500", "NAS100":
		return 1
	default:
		if len(symbol) == 6 {
			return 5
		}
		return 2
	}
}
