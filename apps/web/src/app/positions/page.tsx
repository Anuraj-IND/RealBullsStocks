"use client";

import { TopBar, useEnsureSession } from "@/components/terminal/TopBar";
import { AccountBar } from "@/components/terminal/AccountBar";
import { PositionsPanel } from "@/components/terminal/PositionsPanel";

export default function PositionsPage() {
  useEnsureSession();
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar />
      <AccountBar />
      <main className="min-h-0 flex-1">
        <PositionsPanel />
      </main>
    </div>
  );
}
