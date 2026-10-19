import bcrypt from "bcryptjs";
import { prisma } from "./client.js";
import { applySql } from "./applySql.js";

const PASSWORD = "password123";

type AssetSeed = {
  symbol: string;
  name: string;
  assetClass: "FOREX" | "CRYPTO" | "COMMODITY" | "STOCK" | "INDEX";
  segment?: string;
  base: string;
  quote: string;
  contractSize: number;
  tickSize: number;
  maxLeverage: number;
  feedSource: "binance" | "synthetic";
  startPrice: number;
};

const ASSETS: AssetSeed[] = [
  { symbol: "BTCUSDT", name: "Bitcoin / USDT", assetClass: "CRYPTO", base: "BTC", quote: "USDT", contractSize: 1, tickSize: 0.1, maxLeverage: 20, feedSource: "binance", startPrice: 67000 },
  { symbol: "ETHUSDT", name: "Ethereum / USDT", assetClass: "CRYPTO", base: "ETH", quote: "USDT", contractSize: 1, tickSize: 0.01, maxLeverage: 20, feedSource: "binance", startPrice: 3500 },
  { symbol: "SOLUSDT", name: "Solana / USDT", assetClass: "CRYPTO", base: "SOL", quote: "USDT", contractSize: 1, tickSize: 0.01, maxLeverage: 20, feedSource: "binance", startPrice: 150 },
  { symbol: "XRPUSDT", name: "XRP / USDT", assetClass: "CRYPTO", base: "XRP", quote: "USDT", contractSize: 1, tickSize: 0.0001, maxLeverage: 20, feedSource: "binance", startPrice: 0.52 },
  { symbol: "EURUSD", name: "Euro / US Dollar", assetClass: "FOREX", base: "EUR", quote: "USD", contractSize: 100000, tickSize: 0.00001, maxLeverage: 500, feedSource: "synthetic", startPrice: 1.085 },
  { symbol: "GBPUSD", name: "British Pound / US Dollar", assetClass: "FOREX", base: "GBP", quote: "USD", contractSize: 100000, tickSize: 0.00001, maxLeverage: 500, feedSource: "synthetic", startPrice: 1.271 },
  { symbol: "USDJPY", name: "US Dollar / Japanese Yen", assetClass: "FOREX", base: "USD", quote: "JPY", contractSize: 100000, tickSize: 0.001, maxLeverage: 500, feedSource: "synthetic", startPrice: 151.2 },
  { symbol: "AUDUSD", name: "Australian Dollar / US Dollar", assetClass: "FOREX", base: "AUD", quote: "USD", contractSize: 100000, tickSize: 0.00001, maxLeverage: 500, feedSource: "synthetic", startPrice: 0.659 },
  { symbol: "XAUUSD", name: "Gold Spot / US Dollar", assetClass: "COMMODITY", base: "XAU", quote: "USD", contractSize: 100, tickSize: 0.01, maxLeverage: 100, feedSource: "synthetic", startPrice: 2320 },
  { symbol: "XAGUSD", name: "Silver Spot / US Dollar", assetClass: "COMMODITY", base: "XAG", quote: "USD", contractSize: 5000, tickSize: 0.001, maxLeverage: 100, feedSource: "synthetic", startPrice: 27.4 },
  { symbol: "USOIL", name: "WTI Crude Oil", assetClass: "COMMODITY", base: "OIL", quote: "USD", contractSize: 1000, tickSize: 0.01, maxLeverage: 100, feedSource: "synthetic", startPrice: 78.5 },
  { symbol: "AAPL", name: "Apple Inc.", assetClass: "STOCK", base: "AAPL", quote: "USD", contractSize: 1, tickSize: 0.01, maxLeverage: 20, feedSource: "synthetic", startPrice: 214 },
  { symbol: "TSLA", name: "Tesla Inc.", assetClass: "STOCK", base: "TSLA", quote: "USD", contractSize: 1, tickSize: 0.01, maxLeverage: 20, feedSource: "synthetic", startPrice: 182 },
  { symbol: "NVDA", name: "NVIDIA Corp.", assetClass: "STOCK", base: "NVDA", quote: "USD", contractSize: 1, tickSize: 0.01, maxLeverage: 20, feedSource: "synthetic", startPrice: 118 },
  { symbol: "MSFT", name: "Microsoft Corp.", assetClass: "STOCK", base: "MSFT", quote: "USD", contractSize: 1, tickSize: 0.01, maxLeverage: 20, feedSource: "synthetic", startPrice: 425 },
  { symbol: "US500", name: "S&P 500 Index", assetClass: "INDEX", base: "US500", quote: "USD", contractSize: 1, tickSize: 0.1, maxLeverage: 200, feedSource: "synthetic", startPrice: 5450 },
  { symbol: "NAS100", name: "Nasdaq 100 Index", assetClass: "INDEX", base: "NAS100", quote: "USD", contractSize: 1, tickSize: 0.1, maxLeverage: 200, feedSource: "synthetic", startPrice: 19800 },
  { symbol: "NIFTY50", name: "Nifty 50 Index", assetClass: "INDEX", base: "NIFTY50", quote: "INR", contractSize: 1, tickSize: 0.05, maxLeverage: 200, feedSource: "synthetic", startPrice: 24350 },
  { symbol: "BANKNIFTY", name: "Nifty Bank Index", assetClass: "INDEX", base: "BANKNIFTY", quote: "INR", contractSize: 1, tickSize: 0.05, maxLeverage: 200, feedSource: "synthetic", startPrice: 52100 },
  { symbol: "SENSEX", name: "BSE Sensex Index", assetClass: "INDEX", base: "SENSEX", quote: "INR", contractSize: 1, tickSize: 0.05, maxLeverage: 200, feedSource: "synthetic", startPrice: 79900 },
  { symbol: "FINNIFTY", name: "Nifty Financial Services", assetClass: "INDEX", base: "FINNIFTY", quote: "INR", contractSize: 1, tickSize: 0.05, maxLeverage: 200, feedSource: "synthetic", startPrice: 23600 },
  { symbol: "RELIANCE", name: "Reliance Industries", assetClass: "STOCK", base: "RELIANCE", quote: "INR", contractSize: 1, tickSize: 0.05, maxLeverage: 20, feedSource: "synthetic", startPrice: 2960 },
  { symbol: "TCS", name: "Tata Consultancy Services", assetClass: "STOCK", base: "TCS", quote: "INR", contractSize: 1, tickSize: 0.05, maxLeverage: 20, feedSource: "synthetic", startPrice: 4120 },
  { symbol: "INFY", name: "Infosys Ltd.", assetClass: "STOCK", base: "INFY", quote: "INR", contractSize: 1, tickSize: 0.05, maxLeverage: 20, feedSource: "synthetic", startPrice: 1830 },
  { symbol: "HDFCBANK", name: "HDFC Bank", assetClass: "STOCK", base: "HDFCBANK", quote: "INR", contractSize: 1, tickSize: 0.05, maxLeverage: 20, feedSource: "synthetic", startPrice: 1685 },
  { symbol: "ICICIBANK", name: "ICICI Bank", assetClass: "STOCK", base: "ICICIBANK", quote: "INR", contractSize: 1, tickSize: 0.05, maxLeverage: 20, feedSource: "synthetic", startPrice: 1195 },
  { symbol: "SBIN", name: "State Bank of India", assetClass: "STOCK", base: "SBIN", quote: "INR", contractSize: 1, tickSize: 0.05, maxLeverage: 20, feedSource: "synthetic", startPrice: 815 },
  { symbol: "BHARTIARTL", name: "Bharti Airtel", assetClass: "STOCK", base: "BHARTIARTL", quote: "INR", contractSize: 1, tickSize: 0.05, maxLeverage: 20, feedSource: "synthetic", startPrice: 1540 },
  { symbol: "ITC", name: "ITC Ltd.", assetClass: "STOCK", base: "ITC", quote: "INR", contractSize: 1, tickSize: 0.05, maxLeverage: 20, feedSource: "synthetic", startPrice: 442 },
  { symbol: "LT", name: "Larsen & Toubro", assetClass: "STOCK", base: "LT", quote: "INR", contractSize: 1, tickSize: 0.05, maxLeverage: 20, feedSource: "synthetic", startPrice: 3580 },
  { symbol: "TATAMOTORS", name: "Tata Motors", assetClass: "STOCK", base: "TATAMOTORS", quote: "INR", contractSize: 1, tickSize: 0.05, maxLeverage: 20, feedSource: "synthetic", startPrice: 985 },
  { symbol: "NIFTY50-FUT", name: "Nifty 50 Futures", assetClass: "INDEX", segment: "INDEX_FUTURES", base: "NIFTY50", quote: "INR", contractSize: 50, tickSize: 0.05, maxLeverage: 10, feedSource: "synthetic", startPrice: 24350 },
  { symbol: "BANKNIFTY-FUT", name: "Bank Nifty Futures", assetClass: "INDEX", segment: "INDEX_FUTURES", base: "BANKNIFTY", quote: "INR", contractSize: 15, tickSize: 0.05, maxLeverage: 10, feedSource: "synthetic", startPrice: 52100 },
  { symbol: "RELIANCE-FUT", name: "Reliance Futures", assetClass: "STOCK", segment: "STOCK_FUTURES", base: "RELIANCE", quote: "INR", contractSize: 250, tickSize: 0.05, maxLeverage: 10, feedSource: "synthetic", startPrice: 2960 },
  { symbol: "TCS-FUT", name: "TCS Futures", assetClass: "STOCK", segment: "STOCK_FUTURES", base: "TCS", quote: "INR", contractSize: 175, tickSize: 0.05, maxLeverage: 10, feedSource: "synthetic", startPrice: 4120 },
  { symbol: "NIFTY-24400-CE", name: "Nifty 24400 Call", assetClass: "INDEX", segment: "INDEX_OPTIONS", base: "NIFTY50", quote: "INR", contractSize: 50, tickSize: 0.05, maxLeverage: 10, feedSource: "synthetic", startPrice: 120 },
  { symbol: "NIFTY-24400-PE", name: "Nifty 24400 Put", assetClass: "INDEX", segment: "INDEX_OPTIONS", base: "NIFTY50", quote: "INR", contractSize: 50, tickSize: 0.05, maxLeverage: 10, feedSource: "synthetic", startPrice: 90 },
  { symbol: "BANKNIFTY-52000-CE", name: "Bank Nifty 52000 Call", assetClass: "INDEX", segment: "INDEX_OPTIONS", base: "BANKNIFTY", quote: "INR", contractSize: 15, tickSize: 0.05, maxLeverage: 10, feedSource: "synthetic", startPrice: 250 },
  { symbol: "RELIANCE-3000-CE", name: "Reliance 3000 Call", assetClass: "STOCK", segment: "STOCK_OPTIONS", base: "RELIANCE", quote: "INR", contractSize: 250, tickSize: 0.05, maxLeverage: 10, feedSource: "synthetic", startPrice: 40 },
];

const CLASS_LEVERAGE: Record<string, number> = {
  CRYPTO: 20,
  FOREX: 500,
  COMMODITY: 100,
  STOCK: 20,
  INDEX: 200,
};

async function main() {
  console.log("[seed] start");
  await applySql();

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const tenantA = await prisma.tenant.upsert({
    where: { slug: "realbulls" },
    update: {},
    create: {
      name: "Realbulls",
      slug: "realbulls",
      domain: "localhost",
      primaryColor: "#DC001C",
      accentColor: "#FFCC00",
      background: "#0B132B",
    },
  });

  const tenantB = await prisma.tenant.upsert({
    where: { slug: "bullsx" },
    update: {},
    create: {
      name: "BullsX Exchange",
      slug: "bullsx",
      domain: "bullsx.local",
      primaryColor: "#FFCC00",
      accentColor: "#DC001C",
      background: "#0D1B2A",
    },
  });

  for (const a of ASSETS) {
    const isDeriv = !!a.segment && (a.segment.includes("FUTURES") || a.segment.includes("OPTIONS"));
    const minQty = isDeriv ? 1 : 0.01;
    await prisma.asset.upsert({
      where: { symbol: a.symbol },
      update: { name: a.name, maxLeverage: a.maxLeverage, feedSource: a.feedSource, segment: a.segment ?? "", minQty },
      create: {
        symbol: a.symbol,
        name: a.name,
        assetClass: a.assetClass,
        segment: a.segment ?? "",
        baseCurrency: a.base,
        quoteCurrency: a.quote,
        contractSize: a.contractSize,
        tickSize: a.tickSize,
        maxLeverage: a.maxLeverage,
        feedSource: a.feedSource,
        minQty,
      },
    });
  }
  const assets = await prisma.asset.findMany();

  for (const [assetClass, lev] of Object.entries(CLASS_LEVERAGE)) {
    const exists = await prisma.leverageRule.findFirst({
      where: { tenantId: null, scope: "ASSET_CLASS", assetClass: assetClass as AssetSeed["assetClass"] },
    });
    if (!exists) {
      await prisma.leverageRule.create({
        data: {
          tenantId: null,
          scope: "ASSET_CLASS",
          assetClass: assetClass as AssetSeed["assetClass"],
          maxLeverage: lev,
          marginCallPct: 100,
          stopOutPct: 5,
        },
      });
    }
  }

  for (const tenant of [tenantA, tenantB]) {
    for (const cfg of [
      { assetClass: "FOREX" as const, maxLeverage: 500 },
      { assetClass: "CRYPTO" as const, maxLeverage: 20 },
    ]) {
      const exists = await prisma.leverageRule.findFirst({ where: { tenantId: tenant.id, scope: "ASSET_CLASS", assetClass: cfg.assetClass } });
      if (!exists) {
        await prisma.leverageRule.create({
          data: {
            tenantId: tenant.id,
            scope: "ASSET_CLASS",
            assetClass: cfg.assetClass,
            maxLeverage: cfg.maxLeverage,
            marginCallPct: 100,
            stopOutPct: 5,
          },
        });
      }
    }
    for (const asset of assets) {
      const commission = asset.assetClass === "FOREX" ? 3.5 : asset.assetClass === "COMMODITY" ? 1.5 : 0;
      await prisma.assetConfig.upsert({
        where: { tenantId_assetId: { tenantId: tenant.id, assetId: asset.id } },
        update: {},
        create: {
          tenantId: tenant.id,
          assetId: asset.id,
          spreadMarkupBps: 2,
          spreadMarkdownBps: 2,
          commissionPerLot: commission,
        },
      });
    }
  }

  async function upsertUser(
    tenantId: string,
    email: string,
    role: "SUPER_ADMIN" | "TENANT_ADMIN" | "TRADER",
    displayName: string,
    balance: number,
  ) {
    const user = await prisma.user.upsert({
      where: { tenantId_email: { tenantId, email } },
      update: {},
      create: { tenantId, email, passwordHash, role, displayName, status: "ACTIVE" },
    });
    const existing = await prisma.account.findFirst({ where: { userId: user.id } });
    if (!existing) {
      const account = await prisma.account.create({
        data: {
          userId: user.id,
          tenantId,
          type: "DEMO",
          baseCurrency: "USD",
          balance,
          isPrimary: true,
        },
      });
      const house = await prisma.account.findFirst({ where: { tenantId, isHouse: true } });
      const entryGroupId = `seed-${account.id}`;
      await prisma.ledgerEntry.create({
        data: {
          tenantId,
          accountId: account.id,
          entryGroupId,
          direction: "CREDIT",
          type: "DEPOSIT",
          amount: balance,
          balanceAfter: balance,
          memo: "Initial virtual demo funds",
          createdBy: "seed",
        },
      });
      if (house) {
        await prisma.ledgerEntry.create({
          data: {
            tenantId,
            accountId: house.id,
            entryGroupId,
            direction: "DEBIT",
            type: "DEPOSIT",
            amount: balance,
            balanceAfter: 0,
            memo: "house:Initial virtual demo funds",
            createdBy: "seed",
          },
        });
      }
    }

    let wl = await prisma.watchlist.findFirst({ where: { userId: user.id } });
    if (!wl) wl = await prisma.watchlist.create({ data: { userId: user.id, name: "Default" } });
    const defaultSymbols = [
      "BTCUSDT", "ETHUSDT", "EURUSD", "XAUUSD", "US500",
      "NIFTY50", "BANKNIFTY", "RELIANCE", "TCS", "AAPL",
      "NIFTY50-FUT", "BANKNIFTY-FUT", "NIFTY-24400-CE",
    ];
    const defaults = assets.filter((a) => defaultSymbols.includes(a.symbol));
    let order = await prisma.watchlistItem.count({ where: { watchlistId: wl.id } });
    for (const a of defaults) {
      await prisma.watchlistItem.upsert({
        where: { watchlistId_assetId: { watchlistId: wl.id, assetId: a.id } },
        update: {},
        create: { watchlistId: wl.id, assetId: a.id, sortOrder: order++ },
      });
    }
    return user;
  }

  async function ensureHouse(tenantId: string, slug: string) {
    const systemUser = await prisma.user.upsert({
      where: { tenantId_email: { tenantId, email: `house@${slug}.internal` } },
      update: {},
      create: {
        tenantId,
        email: `house@${slug}.internal`,
        passwordHash,
        role: "TRADER",
        displayName: "HOUSE",
        status: "SUSPENDED",
      },
    });
    const existing = await prisma.account.findFirst({ where: { userId: systemUser.id } });
    if (!existing) {
      await prisma.account.create({
        data: { userId: systemUser.id, tenantId, type: "DEMO", baseCurrency: "USD", isHouse: true },
      });
    }
  }

  await ensureHouse(tenantA.id, tenantA.slug);
  await ensureHouse(tenantB.id, tenantB.slug);

  await upsertUser(tenantA.id, "admin@realbulls.io", "SUPER_ADMIN", "Realbulls Admin", 1000000);
  await upsertUser(tenantA.id, "trader@realbulls.io", "TRADER", "Alice Trader", 100000);
  await upsertUser(tenantB.id, "trader@bullsx.io", "TRADER", "Bob Trader", 50000);
  await upsertUser(tenantB.id, "admin@bullsx.io", "TENANT_ADMIN", "BullsX Admin", 250000);

  console.log("[seed] done");
  console.log("[seed] login: admin@realbulls.io / trader@realbulls.io / trader@bullsx.io  (password: %s)", PASSWORD);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
