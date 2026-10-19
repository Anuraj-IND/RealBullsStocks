package feed

import (
	"context"
	"sync"

	"github.com/realbulls/ws-gateway/internal/model"
	"github.com/realbulls/ws-gateway/internal/store"
)

type Feed interface {
	Run(ctx context.Context) error
}

type Manager struct {
	store *store.Store
	feeds []Feed
	mu    sync.Mutex
	last  map[string]float64
	lmu   sync.RWMutex
}

func NewManager(s *store.Store) *Manager {
	return &Manager{store: s, last: make(map[string]float64)}
}

func (m *Manager) Add(f Feed) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.feeds = append(m.feeds, f)
}

func (m *Manager) Start(ctx context.Context) {
	m.mu.Lock()
	feeds := make([]Feed, len(m.feeds))
	copy(feeds, m.feeds)
	m.mu.Unlock()

	var wg sync.WaitGroup
	for _, f := range feeds {
		wg.Add(1)
		go func(f Feed) {
			defer wg.Done()
			if err := f.Run(ctx); err != nil && ctx.Err() == nil {
				println("feed stopped:", err.Error())
			}
		}(f)
	}
	wg.Wait()
}

func (m *Manager) Publish(ctx context.Context, t model.Tick) {
	m.lmu.Lock()
	m.last[t.Symbol] = t.Mid
	m.lmu.Unlock()
	_ = m.store.PublishTick(ctx, t)
}

func (m *Manager) LastPrice(symbol string) float64 {
	m.lmu.RLock()
	defer m.lmu.RUnlock()
	return m.last[symbol]
}
