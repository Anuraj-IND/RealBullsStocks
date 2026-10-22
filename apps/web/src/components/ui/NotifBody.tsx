"use client";

import { useQuoteCurrencyMap } from "@/lib/hooks";
import { renderNotifBody, type NotifLike } from "@/lib/notifications";

// Notification body rendered in ₹ (structured payload preferred, legacy
// USD-text fallback inside).
export function NotifBody({ n }: { n: NotifLike }) {
  const qc = useQuoteCurrencyMap();
  const rendered = renderNotifBody(n, qc);
  if (rendered === null) {
    if (!n.body) return null;
    return <div className="text-xs text-muted">{n.body}</div>;
  }
  return <div className="text-xs text-muted">{rendered}</div>;
}
