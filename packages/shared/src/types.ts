export interface Tick {
  symbol: string;
  bid: number;
  ask: number;
  mid: number;
  ts: number;
}

export interface CandleBar {
  symbol: string;
  timeframe: string;
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface AccountSnapshot {
  accountId: string;
  balance: number;
  equity: number;
  marginUsed: number;
  marginFree: number;
  marginLevel: number;
  unrealizedPnl: number;
  realizedPnl: number;
  status: "ACTIVE" | "MARGIN_CALL" | "LIQUIDATED" | "CLOSED";
  ts: number;
}

export interface PositionDTO {
  id: string;
  assetId: string;
  symbol: string;
  side: "BUY" | "SELL";
  qty: number;
  avgEntryPrice: number;
  leverage: number;
  marginUsed: number;
  stopLoss: number | null;
  takeProfit: number | null;
  unrealizedPnl: number;
  realizedPnl: number;
  commission: number;
  liquidationPrice: number | null;
  status: "OPEN" | "CLOSED" | "LIQUIDATED";
  openedAt: string;
  closedAt: string | null;
  closedPrice: number | null;
  markPrice?: number;
}

export interface OrderDTO {
  id: string;
  assetId: string;
  symbol: string;
  side: "BUY" | "SELL";
  type: "MARKET" | "LIMIT" | "STOP";
  qty: number;
  price: number | null;
  triggerPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  leverage: number;
  status: "PENDING" | "FILLED" | "PARTIAL" | "CANCELLED" | "REJECTED" | "EXPIRED";
  filledPrice: number | null;
  filledQty: number;
  rejectReason: string | null;
  createdAt: string;
  filledAt: string | null;
  
  kind?: "ORDER" | "SL" | "TP";
}

export interface LedgerDTO {
  id: string;
  direction: "DEBIT" | "CREDIT";
  type: string;
  amount: number;
  balanceAfter: number;
  currency: string;
  refType: string | null;
  refId: string | null;
  memo: string | null;
  createdAt: string;
}


export type WsClientMessage =
  | { op: "subscribe"; symbols?: string[]; accountId?: string; userId?: string }
  | { op: "unsubscribe"; symbols?: string[]; accountId?: string; userId?: string }
  | { op: "ping" };

export type WsServerMessage =
  | { op: "welcome"; ts: number }
  | { op: "tick"; data: Tick }
  | { op: "candle"; data: CandleBar }
  | { op: "account"; data: AccountSnapshot }
  | { op: "position"; data: PositionDTO }
  | { op: "order"; data: OrderDTO }
  | { op: "notification"; data: { id: string; kind: string; title: string; body: string | null; createdAt: string } }
  | { op: "alert"; data: { level: "info" | "warning" | "danger"; message: string } }
  | { op: "pong"; ts: number }
  | { op: "error"; message: string };
