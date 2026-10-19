import { clsx } from "clsx";


export function Logo({ className, withWordmark = true }: { className?: string; withWordmark?: boolean }) {
  return (
    <span className={clsx("inline-flex items-center gap-2", className)}>
      <img src="/brand/logo.svg" alt="Realbulls" className="h-7 w-auto" />
      {withWordmark && (
        <span className="hidden font-display text-[17px] font-extrabold tracking-tight sm:inline">
          <span className="text-accent">REAL</span>
          <span className="text-green">BULLS</span>
        </span>
      )}
    </span>
  );
}
