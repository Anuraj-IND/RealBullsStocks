export type UserRole = "SUPER_ADMIN" | "TENANT_ADMIN" | "TRADER";
export type UserStatus = "ACTIVE" | "SUSPENDED" | "PENDING";
export type AccountType = "DEMO" | "LIVE";
export type AccountStatus = "ACTIVE" | "MARGIN_CALL" | "LIQUIDATED" | "CLOSED";
export type AssetClass = "FOREX" | "CRYPTO" | "COMMODITY" | "STOCK" | "INDEX";
export type Segment = "EQUITY" | "FOREX" | "CRYPTO" | "COMMODITY" | "INDEX_FUTURES" | "INDEX_OPTIONS" | "STOCK_FUTURES" | "STOCK_OPTIONS";
export type OrderSide = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT" | "STOP";
export type OrderStatus = "PENDING" | "FILLED" | "PARTIAL" | "CANCELLED" | "REJECTED" | "EXPIRED";
export type PositionStatus = "OPEN" | "CLOSED" | "LIQUIDATED";
export type LedgerDirection = "DEBIT" | "CREDIT";
export type LedgerType =
  | "DEPOSIT"
  | "WITHDRAWAL"
  | "ADJUSTMENT"
  | "REALIZED_PNL"
  | "COMMISSION"
  | "SWAP"
  | "MARGIN_HOLD"
  | "MARGIN_RELEASE"
  | "LIQUIDATION_FEE";
export type LeverageScope = "GLOBAL" | "ASSET_CLASS" | "ASSET";
export type Timeframe = "M1" | "M5" | "M15" | "H1" | "H4" | "D1";

export const ASSET_CLASSES: AssetClass[] = ["FOREX", "CRYPTO", "COMMODITY", "STOCK", "INDEX"];
export const ORDER_SIDES: OrderSide[] = ["BUY", "SELL"];
export const ORDER_TYPES: OrderType[] = ["MARKET", "LIMIT", "STOP"];
export const FUNDING_LEDGER_TYPES: LedgerType[] = ["DEPOSIT", "WITHDRAWAL", "ADJUSTMENT"];


export const SEGMENTS: Segment[] = ["EQUITY", "FOREX", "CRYPTO", "COMMODITY", "INDEX_FUTURES", "INDEX_OPTIONS", "STOCK_FUTURES", "STOCK_OPTIONS"];

export const SEGMENT_LABELS: Record<Segment, string> = {
  EQUITY: "Equity",
  FOREX: "Forex",
  CRYPTO: "Crypto",
  COMMODITY: "Commodities",
  INDEX_FUTURES: "Index Futures",
  INDEX_OPTIONS: "Index Options",
  STOCK_FUTURES: "Stock Futures",
  STOCK_OPTIONS: "Stock Options",
};


export function segmentForAssetClass(assetClass: AssetClass): Segment {
  switch (assetClass) {
    case "STOCK":
    case "INDEX":
      return "EQUITY";
    case "FOREX":
      return "FOREX";
    case "COMMODITY":
      return "COMMODITY";
    case "CRYPTO":
      return "CRYPTO";
    default:
      return "EQUITY";
  }
}
