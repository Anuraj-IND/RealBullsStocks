package server

import (
	"encoding/json"
	"time"

	"github.com/gorilla/websocket"

	"github.com/realbulls/ws-gateway/internal/model"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = 25 * time.Second
	maxMessageSize = 4096
	sendBuffer     = 512
)

type Client struct {
	hub       *Hub
	conn      *websocket.Conn
	send      chan []byte
	symbols   map[string]struct{}
	accounts  map[string]struct{}
	accountID string
	userID    string
}

func newClient(hub *Hub, conn *websocket.Conn) *Client {
	return &Client{
		hub:      hub,
		conn:     conn,
		send:     make(chan []byte, sendBuffer),
		symbols:  make(map[string]struct{}),
		accounts: make(map[string]struct{}),
	}
}

func (c *Client) enqueue(payload []byte) {
	select {
	case c.send <- payload:
	default:
	}
}

func (c *Client) readPump() {
	defer func() {
		c.hub.Unregister(c)
		c.conn.Close()
	}()
	c.conn.SetReadLimit(maxMessageSize)
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		return c.conn.SetReadDeadline(time.Now().Add(pongWait))
	})

	for {
		_, raw, err := c.conn.ReadMessage()
		if err != nil {
			return
		}
		var msg model.ClientMessage
		if err := json.Unmarshal(raw, &msg); err != nil {
			c.enqueueError("invalid message")
			continue
		}
		switch msg.Op {
		case "subscribe":
			c.hub.SubscribeSymbols(c, msg.Symbols)
			if msg.AccountID != "" {
				c.accountID = msg.AccountID
				c.hub.SubscribeAccount(c, msg.AccountID)
			}
			if msg.UserID != "" {
				c.hub.SubscribeUser(c, msg.UserID)
			}
		case "unsubscribe":
			c.hub.UnsubscribeSymbols(c, msg.Symbols)
			if msg.AccountID != "" {
				c.hub.UnsubscribeAccount(c, msg.AccountID)
			}
			if msg.UserID != "" {
				c.hub.UnsubscribeUser(c, msg.UserID)
			}
		case "ping":
			c.enqueuePong()
		default:
			c.enqueueError("unknown op")
		}
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case payload, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, payload); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *Client) enqueuePong() {
	payload, _ := json.Marshal(model.ServerMessage{Op: "pong", TS: time.Now().UnixMilli()})
	c.enqueue(payload)
}

func (c *Client) enqueueError(message string) {
	payload, _ := json.Marshal(model.ServerMessage{Op: "error", Msg: message})
	c.enqueue(payload)
}
