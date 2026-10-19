import { z } from "zod";

export const loginSchema = z
  .object({
    identifier: z.string().min(1).optional(),
    email: z.string().min(1).optional(),
    password: z.string().min(6),
    tenantSlug: z.string().optional(),
  })
  .refine((v) => Boolean(v.identifier || v.email), { message: "identifier is required", path: ["identifier"] });

export const registerSchema = z.object({
  name: z.string().min(1).max(80),
  email: z.string().email(),
  password: z.string().min(6).max(128),
});

export const placeOrderSchema = z
  .object({
    assetId: z.string().min(1),
    accountId: z.string().min(1).optional(),
    side: z.enum(["BUY", "SELL"]),
    type: z.enum(["MARKET", "LIMIT", "STOP"]),
    qty: z.coerce.number().positive(),
    leverage: z.coerce.number().int().positive().max(1000).optional(),
    price: z.coerce.number().positive().optional(),
    triggerPrice: z.coerce.number().positive().optional(),
    stopLoss: z.coerce.number().positive().optional(),
    takeProfit: z.coerce.number().positive().optional(),
    idempotencyKey: z.string().min(8).max(128).optional(),
  })
  .refine((v) => v.type !== "LIMIT" || v.price !== undefined, {
    message: "price is required for LIMIT orders",
    path: ["price"],
  })
  .refine((v) => v.type !== "STOP" || v.triggerPrice !== undefined, {
    message: "triggerPrice is required for STOP orders",
    path: ["triggerPrice"],
  });

export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;

export const closePositionSchema = z.object({
  qty: z.coerce.number().positive().optional(),
});

export const adminAdjustSchema = z.object({
  accountId: z.string().min(1),
  type: z.enum(["DEPOSIT", "WITHDRAWAL", "ADJUSTMENT"]),
  amount: z.coerce.number(),
  memo: z.string().max(280).optional(),
});

export const leverageUpdateSchema = z.object({
  tenantId: z.string().nullable().optional(),
  scope: z.enum(["GLOBAL", "ASSET_CLASS", "ASSET"]),
  assetClass: z.enum(["FOREX", "CRYPTO", "COMMODITY", "STOCK", "INDEX"]).nullable().optional(),
  assetId: z.string().nullable().optional(),
  maxLeverage: z.coerce.number().int().min(1).max(1000),
  marginCallPct: z.coerce.number().min(0).max(1000).optional(),
  stopOutPct: z.coerce.number().min(0).max(1000).optional(),
});

export const userLeverageSchema = z.object({
  userId: z.string().min(1),
  assetClass: z.enum(["FOREX", "CRYPTO", "COMMODITY", "STOCK", "INDEX"]).nullable().optional(),
  assetId: z.string().nullable().optional(),
  leverage: z.coerce.number().int().min(1).max(1000),
});


export const leverageSegmentsSchema = z.object({
  segments: z.object({
    EQUITY: z.coerce.number().int().min(1).max(1000).optional(),
    FOREX: z.coerce.number().int().min(1).max(1000).optional(),
    CRYPTO: z.coerce.number().int().min(1).max(1000).optional(),
    COMMODITY: z.coerce.number().int().min(1).max(1000).optional(),
    INDEX_FUTURES: z.coerce.number().int().min(1).max(1000).optional(),
    INDEX_OPTIONS: z.coerce.number().int().min(1).max(1000).optional(),
    STOCK_FUTURES: z.coerce.number().int().min(1).max(1000).optional(),
    STOCK_OPTIONS: z.coerce.number().int().min(1).max(1000).optional(),
  }),
});

export type LeverageSegmentsInput = z.infer<typeof leverageSegmentsSchema>;

export const assetConfigSchema = z.object({
  tenantId: z.string().min(1),
  assetId: z.string().min(1),
  enabled: z.boolean().optional(),
  spreadMarkupBps: z.coerce.number().min(0).max(1000).optional(),
  spreadMarkdownBps: z.coerce.number().min(0).max(1000).optional(),
  commissionPerLot: z.coerce.number().min(0).optional(),
  commissionPerOrder: z.coerce.number().min(0).optional(),
  minLeverage: z.coerce.number().int().min(1).optional(),
  maxLeverage: z.coerce.number().int().min(1).max(1000).nullable().optional(),
});

export const createTenantSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z.string().regex(/^[a-z0-9-]{2,40}$/),
  domain: z.string().min(3),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export const watchlistAddSchema = z
  .object({
    assetId: z.string().min(1).optional(),
    instrumentToken: z.string().min(1).optional(),
    watchlistId: z.string().optional(),
  })
  .refine((v) => Boolean(v.assetId || v.instrumentToken), {
    message: "assetId or instrumentToken is required",
  });
