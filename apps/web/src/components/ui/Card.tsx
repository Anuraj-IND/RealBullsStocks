import type { ReactNode } from "react";
import { clsx } from "clsx";

export function Card({ children, className, title, action }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode }) {
  return (
    <section className={clsx("panel", className)}>
      {(title || action) && (
        <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <h3 className="text-sm font-semibold tracking-wide text-ink/90">{title}</h3>
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Stat({ label, value, tone = "default", onClick }: { label: string; value: ReactNode; tone?: "default" | "up" | "down" | "amber"; onClick?: () => void }) {
  const toneClass =
    tone === "up" ? "text-lime" : tone === "down" ? "text-brandbright" : tone === "amber" ? "text-amber" : "text-ink";
  const body = (
    <>
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className={clsx("num mt-0.5 text-base font-semibold", toneClass)}>{value}</div>
    </>
  );
  if (!onClick) {
    return <div className="panel-tight px-3 py-2">{body}</div>;
  }
  return (
    <button className="panel-tight w-full cursor-pointer px-3 py-2 text-left hover:bg-slate/40" onClick={onClick} title="View breakdown">
      {body}
    </button>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "up" | "down" | "amber" | "info" }) {
  const map = {
    neutral: "bg-slate2 text-ink",
    up: "bg-lime/15 text-lime",
    down: "bg-brand/15 text-brandbright",
    amber: "bg-amber/15 text-amber",
    info: "bg-logoblue/20 text-blue-300",
  } as const;
  return <span className={clsx("badge", map[tone])}>{children}</span>;
}
