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
  feedSource: "binance" | "nse";
};

const ASSETS: AssetSeed[] = [
  { symbol: "BTCUSDT", name: "Bitcoin / USDT", assetClass: "CRYPTO", base: "BTC", quote: "USDT", contractSize: 1, tickSize: 0.1, maxLeverage: 500, feedSource: "binance" },
  { symbol: "ETHUSDT", name: "Ethereum / USDT", assetClass: "CRYPTO", base: "ETH", quote: "USDT", contractSize: 1, tickSize: 0.01, maxLeverage: 500, feedSource: "binance" },
  { symbol: "SOLUSDT", name: "Solana / USDT", assetClass: "CRYPTO", base: "SOL", quote: "USDT", contractSize: 1, tickSize: 0.01, maxLeverage: 500, feedSource: "binance" },
  { symbol: "XRPUSDT", name: "XRP / USDT", assetClass: "CRYPTO", base: "XRP", quote: "USDT", contractSize: 1, tickSize: 0.0001, maxLeverage: 500, feedSource: "binance" },
  { symbol: "NIFTY50", name: "Nifty 50 Index", assetClass: "INDEX", base: "NIFTY50", quote: "INR", contractSize: 1, tickSize: 0.05, maxLeverage: 500, feedSource: "nse" },
  { symbol: "BANKNIFTY", name: "Nifty Bank Index", assetClass: "INDEX", base: "BANKNIFTY", quote: "INR", contractSize: 1, tickSize: 0.05, maxLeverage: 500, feedSource: "nse" },
  { symbol: "FINNIFTY", name: "Nifty Financial Services", assetClass: "INDEX", base: "FINNIFTY", quote: "INR", contractSize: 1, tickSize: 0.05, maxLeverage: 500, feedSource: "nse" },
  { symbol: "RELIANCE", name: "Reliance Industries", assetClass: "STOCK", base: "RELIANCE", quote: "INR", contractSize: 1, tickSize: 0.05, maxLeverage: 500, feedSource: "nse" },
  { symbol: "TCS", name: "Tata Consultancy Services", assetClass: "STOCK", base: "TCS", quote: "INR", contractSize: 1, tickSize: 0.05, maxLeverage: 500, feedSource: "nse" },
  { symbol: "INFY", name: "Infosys Ltd.", assetClass: "STOCK", base: "INFY", quote: "INR", contractSize: 1, tickSize: 0.05, maxLeverage: 500, feedSource: "nse" },
  { symbol: "HDFCBANK", name: "HDFC Bank", assetClass: "STOCK", base: "HDFCBANK", quote: "INR", contractSize: 1, tickSize: 0.05, maxLeverage: 500, feedSource: "nse" },
  { symbol: "ICICIBANK", name: "ICICI Bank", assetClass: "STOCK", base: "ICICIBANK", quote: "INR", contractSize: 1, tickSize: 0.05, maxLeverage: 500, feedSource: "nse" },
  { symbol: "SBIN", name: "State Bank of India", assetClass: "STOCK", base: "SBIN", quote: "INR", contractSize: 1, tickSize: 0.05, maxLeverage: 500, feedSource: "nse" },
  { symbol: "BHARTIARTL", name: "Bharti Airtel", assetClass: "STOCK", base: "BHARTIARTL", quote: "INR", contractSize: 1, tickSize: 0.05, maxLeverage: 500, feedSource: "nse" },
  { symbol: "ITC", name: "ITC Ltd.", assetClass: "STOCK", base: "ITC", quote: "INR", contractSize: 1, tickSize: 0.05, maxLeverage: 500, feedSource: "nse" },
  { symbol: "LT", name: "Larsen & Toubro", assetClass: "STOCK", base: "LT", quote: "INR", contractSize: 1, tickSize: 0.05, maxLeverage: 500, feedSource: "nse" },
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
    createdById?: string | null,
  ) {
    const user = await prisma.user.upsert({
      where: { tenantId_email: { tenantId, email } },
      update: createdById ? { createdById } : {},
      create: { tenantId, email, passwordHash, role, displayName, status: "ACTIVE", createdById: createdById ?? null },
    });
    const existing = await prisma.account.findFirst({ where: { userId: user.id } });
    if (!existing) {
      const account = await prisma.account.create({
        data: {
          userId: user.id,
          tenantId,
          type: "DEMO",
          baseCurrency: "INR",
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
      "BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT",
      "NIFTY50", "BANKNIFTY", "FINNIFTY",
      "RELIANCE", "TCS", "HDFCBANK", "ICICIBANK",
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

  const superAdmin = await upsertUser(tenantA.id, "admin@realbulls.io", "SUPER_ADMIN", "Realbulls Admin", 1000000);
  await upsertUser(tenantA.id, "trader@realbulls.io", "TRADER", "Alice Trader", 100000, superAdmin.id);
  const tenantAdmin = await upsertUser(tenantB.id, "admin@bullsx.io", "TENANT_ADMIN", "BullsX Admin", 250000, superAdmin.id);
  await upsertUser(tenantB.id, "trader@bullsx.io", "TRADER", "Bob Trader", 50000, tenantAdmin.id);

  console.log("[seed] done");
  console.log("[seed] login: admin@realbulls.io / trader@realbulls.io / trader@bullsx.io  (password: %s)", PASSWORD);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
