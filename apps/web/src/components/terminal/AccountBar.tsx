"use client";

import { cls } from "@/lib/format";
import { useAccountStore, useUiStore } from "@/lib/store";
import { useMoney } from "@/lib/money";
import { useActiveAccount, usePositions } from "@/lib/hooks";

export function AccountBar() {
  const snapshot = useAccountStore((s) => s.snapshot);
  const advanced = useUiStore((s) => s.advanced);
  const money = useMoney();
  const account = useActiveAccount();
  const positions = usePositions();

  const balance = snapshot?.balance ?? positions.data?.summary.balance ?? account?.balance ?? 0;
  const equity = snapshot?.equity ?? positions.data?.summary.equity ?? balance;
  const marginUsed = snapshot?.marginUsed ?? positions.data?.summary.marginUsed ?? account?.marginUsed ?? 0;
  const unrealized = snapshot?.unrealizedPnl ?? positions.data?.summary.unrealizedPnl ?? 0;
  const free = equity - marginUsed;
  const level = marginUsed > 0 ? (equity / marginUsed) * 100 : null;

  return (
    <div className={cls("grid gap-px overflow-hidden border-b border-line bg-line/60", advanced ? "grid-cols-2 md:grid-cols-6" : "grid-cols-3")}>
      <Cell label="Balance" value={money.fmt(balance)} />
      <Cell label="Equity" value={money.fmt(equity)} />
      <Cell label="Unrealized P&L" value={money.signed(unrealized)} tone={unrealized >= 0 ? "up" : "down"} />
      {advanced && <Cell label="Margin used" value={money.fmt(marginUsed)} />}
      {advanced && <Cell label="Free margin" value={money.fmt(free)} />}
      {advanced && (
        <Cell
          label="Margin level"
          value={level === null ? "—" : `${level.toFixed(1)}%`}
          tone={level === null ? "default" : level < 100 ? "down" : level < 200 ? "warn" : "up"}
        />
      )}
    </div>
  );
}

function Cell({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "up" | "down" | "warn" }) {
  const toneClass =
    tone === "up" ? "text-lime" : tone === "down" ? "text-brandbright" : tone === "warn" ? "text-amber" : "text-ink";
  return (
    <div className="bg-navy2 px-2.5 py-1.5 sm:px-4 sm:py-2">
      <div className="text-[9px] uppercase tracking-wider text-muted sm:text-[10px]">{label}</div>
      <div className={cls("num mt-0.5 whitespace-nowrap text-[12px] font-semibold sm:text-sm", toneClass)}>{value}</div>
    </div>
  );
}
