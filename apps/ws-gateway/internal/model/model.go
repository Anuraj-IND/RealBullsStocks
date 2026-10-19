package model

type Tick struct {
	Symbol string  `json:"symbol"`
	Bid    float64 `json:"bid"`
	Ask    float64 `json:"ask"`
	Mid    float64 `json:"mid"`
	Ts     int64   `json:"ts"`
}

type AssetDef struct {
	Symbol          string  `json:"symbol"`
	FeedSource      string  `json:"feedSource"`
	StartPrice      float64 `json:"startPrice"`
	AssetClass      string  `json:"assetClass"`
	QuoteCurrency   string  `json:"quoteCurrency"`
	Segment         string  `json:"segment"`
	Underlying      string  `json:"underlying"`
	InstrumentToken string  `json:"instrumentToken"`
	Exchange        string  `json:"exchange"`
	Tradingsymbol   string  `json:"tradingsymbol"`
}

type Registry struct {
	Assets []AssetDef `json:"assets"`
}

type ClientMessage struct {
	Op        string   `json:"op"`
	Symbols   []string `json:"symbols"`
	AccountID string   `json:"accountId"`
	UserID    string   `json:"userId"`
}

type ServerMessage struct {
	Op   string      `json:"op"`
	Data interface{} `json:"data,omitempty"`
	TS   int64       `json:"ts,omitempty"`
	Msg  string      `json:"message,omitempty"`
}
