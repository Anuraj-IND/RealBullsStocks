"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cls } from "@/lib/format";
import { useToastStore, type Toast } from "@/lib/store";

export function Toasts() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[320px] flex-col gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onClose={() => dismiss(t.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastCard({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4600);
    return () => clearTimeout(timer);
  }, [onClose]);

  const accent =
    toast.kind === "success" ? "border-l-lime" : toast.kind === "error" ? "border-l-brandbright" : "border-l-accent";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ duration: 0.18 }}
      className={cls("pointer-events-auto border border-line border-l-2 bg-navy2 px-3 py-2 shadow-panel", accent)}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[13px] font-semibold text-ink">{toast.title}</div>
          {toast.message && <div className="mt-0.5 text-xs text-muted">{toast.message}</div>}
        </div>
        <button onClick={onClose} className="text-muted transition-colors hover:text-ink" aria-label="Dismiss">
          ×
        </button>
      </div>
    </motion.div>
  );
}
