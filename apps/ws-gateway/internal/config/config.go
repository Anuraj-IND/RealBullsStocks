package config

import (
	"os"
	"strconv"
	"strings"
)

type SymbolMap struct {
	Internal string
	External string
}

type Config struct {
	Port           string
	RedisURL       string
	BinanceSymbols []string
	RegistryKey    string

	TwelveDataKey     string
	TwelveDataPollMS  int
	TwelveDataSymbols []SymbolMap

	ZerodhaKey     string
	ZerodhaSymbols []SymbolMap
	ZerodhaPollMS  int
}

func getenv(key, def string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return def
}

func getint(key string, def int) int {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}

func splitCSV(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, strings.ToLower(p))
		}
	}
	return out
}

func parseSymbolMaps(s string) []SymbolMap {
	out := []SymbolMap{}
	for _, pair := range strings.Split(s, ",") {
		pair = strings.TrimSpace(pair)
		if pair == "" {
			continue
		}
		kv := strings.SplitN(pair, "=", 2)
		if len(kv) != 2 {
			continue
		}
		internal := strings.ToUpper(strings.TrimSpace(kv[0]))
		external := strings.TrimSpace(kv[1])
		if internal == "" || external == "" {
			continue
		}
		out = append(out, SymbolMap{Internal: internal, External: external})
	}
	return out
}

const defaultTwelveDataSymbols = "EURUSD=EUR/USD,GBPUSD=GBP/USD,USDJPY=USD/JPY,AUDUSD=AUD/USD," +
	"XAUUSD=XAU/USD,NIFTY50=NSE:NIFTY 50,BANKNIFTY=NSE:NIFTY BANK,RELIANCE=NSE:RELIANCE"

const defaultZerodhaSymbols = "RELIANCE=NSE:RELIANCE,TCS=NSE:TCS,INFY=NSE:INFY,HDFCBANK=NSE:HDFCBANK," +
	"ICICIBANK=NSE:ICICIBANK,SBIN=NSE:SBIN,NIFTY50=NSE:NIFTY 50,BANKNIFTY=NSE:NIFTY BANK,SENSEX=BSE:SENSEX"

func Load() Config {
	return Config{
		Port:              getenv("WS_PORT", "8080"),
		RedisURL:          getenv("REDIS_URL", "redis://localhost:6379"),
		BinanceSymbols:    splitCSV(getenv("BINANCE_SYMBOLS", "")),
		RegistryKey:       getenv("REGISTRY_KEY", "realbulls:registry"),
		TwelveDataKey:     getenv("TWELVEDATA_API_KEY", ""),
		TwelveDataPollMS:  getint("TWELVEDATA_POLL_MS", 15000),
		TwelveDataSymbols: parseSymbolMaps(getenv("TWELVEDATA_SYMBOLS", defaultTwelveDataSymbols)),
		ZerodhaKey:        getenv("ZERODHA_API_KEY", ""),
		ZerodhaSymbols:    parseSymbolMaps(getenv("ZERODHA_SYMBOLS", defaultZerodhaSymbols)),
		ZerodhaPollMS:     getint("ZERODHA_POLL_MS", 2000),
	}
}
