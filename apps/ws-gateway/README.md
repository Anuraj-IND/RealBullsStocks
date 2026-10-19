# Realbulls WS Gateway (Go)

High-throughput market-data gateway. It does two things:

1. **Ingests** prices — real Binance `bookTicker` streams for crypto, and an
   internal GBM simulator for forex/commodities/stocks/indices — and publishes
   normalized ticks to Redis (`ticks:{SYMBOL}` + `realbulls:price:{SYMBOL}`).
2. **Fans out** — runs the browser-facing WebSocket server, routing Redis
   `ticks:*` and `accounts:*` messages to clients subscribed to each symbol or
   trading account.

## Run

```bash
go run ./cmd/gateway
```

## Env

The gateway reads variables from the process environment (no `.env` loader).

| Var | Default | Description |
| --- | --- | --- |
| `WS_PORT` | `8080` | listen port |
| `REDIS_URL` | `redis://localhost:6379` | Redis |
| `REGISTRY_KEY` | `realbulls:registry` | registry published by the API (symbols + start prices) |
| `BINANCE_SYMBOLS` | `""` | crypto symbols to mirror |
| `SYNTHETIC_ENABLED` | `true` | generate synthetic GBM ticks for unfed symbols |
| `TICK_THROTTLE_MS` | `250` | synthetic publish cadence |
| `TWELVEDATA_API_KEY` | `""` | Twelve Data key (forex/commodities) |
| `TWELVEDATA_SYMBOLS` | built-in list | `INTERNAL=NSE:SYMBOL` pairs |
| `TWELVEDATA_POLL_MS` | `60000` | poll interval |
| `ZERODHA_API_KEY` | `""` | Kite Connect key (NSE/BSE) |
| `ZERODHA_SYMBOLS` | built-in list | `INTERNAL=NSE:SYMBOL` pairs |
| `ZERODHA_POLL_MS` | `30000` | poll interval |

The Zerodha feed also requires `zerodha:access_token` in Redis (set by the API
after broker login). Without it the gateway falls back to synthetic ticks.


## Endpoints

- `GET /ws` — websocket (subscribe/unsubscribe/ping ops)
- `GET /healthz` — liveness
- `GET /metrics` — connected client count

## Client protocol

```jsonc
// -> subscribe
{ "op": "subscribe", "symbols": ["EURUSD", "BTCUSDT"], "accountId": "acc_123" }
// -> ping
{ "op": "ping" }
// <- server
{ "op": "welcome", "ts": 1710000000000 }
{ "op": "tick", "data": { "symbol": "EURUSD", "bid": 1.0849, "ask": 1.0851, "mid": 1.085, "ts": 1710000000000 } }
{ "op": "account", "data": { "accountId": "acc_123", "equity": 100120.5, "marginLevel": 812.3, "...": "..." } }
```
