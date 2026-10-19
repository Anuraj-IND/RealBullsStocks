package server

import (
	"context"
	"encoding/json"
	"strings"
	"sync"

	"github.com/realbulls/ws-gateway/internal/model"
	"github.com/realbulls/ws-gateway/internal/store"
)

type Hub struct {
	redis *store.Store

	mu        sync.RWMutex
	clients   map[*Client]struct{}
	bySymbol  map[string]map[*Client]struct{}
	byAccount map[string]map[*Client]struct{}
	byUser    map[string]map[*Client]struct{}
}

func NewHub(s *store.Store) *Hub {
	return &Hub{
		redis:     s,
		clients:   make(map[*Client]struct{}),
		bySymbol:  make(map[string]map[*Client]struct{}),
		byAccount: make(map[string]map[*Client]struct{}),
		byUser:    make(map[string]map[*Client]struct{}),
	}
}

func (h *Hub) Register(c *Client) {
	h.mu.Lock()
	h.clients[c] = struct{}{}
	h.mu.Unlock()
}

func (h *Hub) Unregister(c *Client) {
	h.mu.Lock()
	delete(h.clients, c)
	for sym := range c.symbols {
		h.removeSub(h.bySymbol, sym, c)
	}
	for acc := range c.accounts {
		h.removeSub(h.byAccount, acc, c)
	}
	if c.userID != "" {
		h.removeSub(h.byUser, c.userID, c)
	}
	c.symbols = map[string]struct{}{}
	c.accounts = map[string]struct{}{}
	h.mu.Unlock()
}

func (h *Hub) removeSub(m map[string]map[*Client]struct{}, key string, c *Client) {
	if set, ok := m[key]; ok {
		delete(set, c)
		if len(set) == 0 {
			delete(m, key)
		}
	}
}

func (h *Hub) SubscribeSymbols(c *Client, symbols []string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, s := range symbols {
		s = strings.ToUpper(strings.TrimSpace(s))
		if s == "" {
			continue
		}
		c.symbols[s] = struct{}{}
		if h.bySymbol[s] == nil {
			h.bySymbol[s] = map[*Client]struct{}{}
		}
		h.bySymbol[s][c] = struct{}{}
	}
}

func (h *Hub) UnsubscribeSymbols(c *Client, symbols []string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, s := range symbols {
		s = strings.ToUpper(strings.TrimSpace(s))
		delete(c.symbols, s)
		h.removeSub(h.bySymbol, s, c)
	}
}

func (h *Hub) SubscribeAccount(c *Client, accountID string) {
	if accountID == "" {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	c.accounts[accountID] = struct{}{}
	if h.byAccount[accountID] == nil {
		h.byAccount[accountID] = map[*Client]struct{}{}
	}
	h.byAccount[accountID][c] = struct{}{}
}

func (h *Hub) UnsubscribeAccount(c *Client, accountID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(c.accounts, accountID)
	h.removeSub(h.byAccount, accountID, c)
}

func (h *Hub) SubscribeUser(c *Client, userID string) {
	if userID == "" {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	c.userID = userID
	if h.byUser[userID] == nil {
		h.byUser[userID] = map[*Client]struct{}{}
	}
	h.byUser[userID][c] = struct{}{}
}

func (h *Hub) UnsubscribeUser(c *Client, userID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	c.userID = ""
	h.removeSub(h.byUser, userID, c)
}

func (h *Hub) RunFanout(ctx context.Context, patterns ...string) error {
	pubsub := h.redis.SubscribePatterns(ctx, patterns...)
	defer pubsub.Close()

	ch := pubsub.Channel()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case msg, ok := <-ch:
			if !ok {
				return nil
			}
			h.dispatch(msg.Channel, []byte(msg.Payload))
		}
	}
}

func (h *Hub) dispatch(channel string, payload []byte) {
	switch {
	case strings.HasPrefix(channel, "ticks:"):
		h.dispatchTick(payload)
	case strings.HasPrefix(channel, "accounts:"):
		accountID := strings.TrimPrefix(channel, "accounts:")
		h.dispatchAccount(accountID, payload)
	case strings.HasPrefix(channel, "notify:"):
		userID := strings.TrimPrefix(channel, "notify:")
		h.dispatchNotify(userID, payload)
	}
}

func (h *Hub) dispatchTick(payload []byte) {
	var tick model.Tick
	if err := json.Unmarshal(payload, &tick); err != nil {
		return
	}
	msg, err := json.Marshal(model.ServerMessage{Op: "tick", Data: tick})
	if err != nil {
		return
	}
	h.mu.RLock()
	targets := h.copySet(h.bySymbol[tick.Symbol])
	h.mu.RUnlock()
	for _, c := range targets {
		c.enqueue(msg)
	}
}

func (h *Hub) dispatchAccount(accountID string, payload []byte) {
	var snapshot map[string]interface{}
	if err := json.Unmarshal(payload, &snapshot); err != nil {
		return
	}
	msg, err := json.Marshal(model.ServerMessage{Op: "account", Data: snapshot})
	if err != nil {
		return
	}
	h.mu.RLock()
	targets := h.copySet(h.byAccount[accountID])
	h.mu.RUnlock()
	for _, c := range targets {
		c.enqueue(msg)
	}
}

func (h *Hub) dispatchNotify(userID string, payload []byte) {
	var snapshot map[string]interface{}
	if err := json.Unmarshal(payload, &snapshot); err != nil {
		return
	}
	msg, err := json.Marshal(model.ServerMessage{Op: "notification", Data: snapshot})
	if err != nil {
		return
	}
	h.mu.RLock()
	targets := h.copySet(h.byUser[userID])
	h.mu.RUnlock()
	for _, c := range targets {
		c.enqueue(msg)
	}
}

func (h *Hub) copySet(set map[*Client]struct{}) []*Client {
	if len(set) == 0 {
		return nil
	}
	out := make([]*Client, 0, len(set))
	for c := range set {
		out = append(out, c)
	}
	return out
}

func (h *Hub) BroadcastAlert(level, message string) {
	msg, err := json.Marshal(model.ServerMessage{Op: "alert", Data: map[string]string{"level": level, "message": message}})
	if err != nil {
		return
	}
	h.mu.RLock()
	all := make([]*Client, 0, len(h.clients))
	for c := range h.clients {
		all = append(all, c)
	}
	h.mu.RUnlock()
	for _, c := range all {
		c.enqueue(msg)
	}
}

func (h *Hub) ClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}
