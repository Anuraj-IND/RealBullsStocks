"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Logo } from "@/components/ui/Logo";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("App error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo />
      <h1 className="font-display text-xl font-bold">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted">
        An unexpected error occurred. You can retry, or head back to the terminal.
      </p>
      <div className="flex gap-2">
        <button onClick={reset} className="btn-primary">
          Try again
        </button>
        <Link href="/terminal" className="btn-ghost">
          Go to terminal
        </Link>
      </div>
    </div>
  );
}
