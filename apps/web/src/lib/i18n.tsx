"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Locale = "en" | "hi";

export const LOCALES: Array<{ id: Locale; label: string }> = [
  { id: "en", label: "English" },
  { id: "hi", label: "हिन्दी" },
];

const en = {
  "nav.terminal": "Terminal",
  "nav.positions": "Positions",
  "nav.orderbook": "Order Book",
  "nav.analytics": "Analytics",
  "nav.admin": "Admin",
  "nav.settings": "Settings",
  "top.signout": "Sign out",
  "top.live": "Live",
  "top.connecting": "Connecting…",
  "top.more": "More",
  "top.simple": "Simplified",
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.close": "Close",
  "common.loading": "Loading…",
  "common.search": "Search markets…",
  "common.create": "Create",
  "common.notifications": "Notifications",
  "common.alerts": "Price alerts",
  "common.markAllRead": "Mark all read",
  "common.clearAll": "Clear all",
  "common.delete": "Delete",
  "common.noNotifications": "No notifications",
  "settings.title": "Settings",
  "settings.profile": "Profile",
  "settings.displayName": "Display name",
  "settings.language": "Language",
  "settings.security": "Security",
  "settings.currentPassword": "Current password",
  "settings.newPassword": "New password",
  "settings.changePassword": "Change password",
  "settings.alerts": "Price alerts",
  "settings.noAlerts": "No price alerts yet — add one from a chart.",
  "settings.saved": "Saved",
  "alert.above": "Above",
  "alert.below": "Below",
  "alert.create": "Create alert",
  "chart.alert": "Alert",
} as const;

type Key = keyof typeof en;

const hi: Record<Key, string> = {
  "nav.terminal": "टर्मिनल",
  "nav.positions": "पोज़िशन",
  "nav.orderbook": "ऑर्डर बुक",
  "nav.analytics": "विश्लेषण",
  "nav.admin": "एडमिन",
  "nav.settings": "सेटिंग्स",
  "top.signout": "साइन आउट",
  "top.live": "लाइव",
  "top.connecting": "कनेक्ट हो रहा है…",
  "top.more": "अधिक",
  "top.simple": "सरल",
  "common.save": "सहेजें",
  "common.cancel": "रद्द करें",
  "common.close": "बंद करें",
  "common.loading": "लोड हो रहा है…",
  "common.search": "बाज़ार खोजें…",
  "common.create": "बनाएँ",
  "common.notifications": "सूचनाएँ",
  "common.alerts": "मूल्य अलर्ट",
  "common.markAllRead": "सभी को पढ़ा हुआ चिह्नित करें",
  "common.clearAll": "सभी साफ़ करें",
  "common.delete": "हटाएँ",
  "common.noNotifications": "कोई सूचना नहीं",
  "settings.title": "सेटिंग्स",
  "settings.profile": "प्रोफ़ाइल",
  "settings.displayName": "प्रदर्शित नाम",
  "settings.language": "भाषा",
  "settings.security": "सुरक्षा",
  "settings.currentPassword": "वर्तमान पासवर्ड",
  "settings.newPassword": "नया पासवर्ड",
  "settings.changePassword": "पासवर्ड बदलें",
  "settings.alerts": "मूल्य अलर्ट",
  "settings.noAlerts": "कोई अलर्ट नहीं — चार्ट से एक बनाएँ।",
  "settings.saved": "सहेजा गया",
  "alert.above": "ऊपर",
  "alert.below": "नीचे",
  "alert.create": "अलर्ट बनाएँ",
  "chart.alert": "अलर्ट",
};

const DICTS: Record<Locale, Record<Key, string>> = { en, hi };

interface I18nValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: Key, vars?: Record<string, string | number>) => string;
}

const Ctx = createContext<I18nValue>({
  locale: "en",
  setLocale: () => undefined,
  t: (k) => k,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const stored = typeof window !== "undefined" ? (window.localStorage.getItem("rb_locale") as Locale | null) : null;
    if (stored && stored in DICTS) setLocaleState(stored);
  }, []);

  function setLocale(l: Locale) {
    setLocaleState(l);
    if (typeof window !== "undefined") window.localStorage.setItem("rb_locale", l);
  }

  function t(key: Key, vars?: Record<string, string | number>): string {
    let s = DICTS[locale][key] ?? DICTS.en[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
    return s;
  }

  return <Ctx.Provider value={{ locale, setLocale, t }}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(Ctx);
}
