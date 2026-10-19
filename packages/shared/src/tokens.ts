
export const tokens = {
  color: {
    navy: "#0B132B",
    navy2: "#0D1B2A",
    slate: "#1B263B",
    slate2: "#243b55",
    red: "#DC001C",
    redBright: "#E63946",
    yellow: "#FFCC00",
    yellowSoft: "#FFD166",
    lime: "#00E676",
    logoGreen: "#019B69",
    logoBlue: "#0052BE",
    text: "#E6EDF7",
    textMuted: "#8A9BB8",
    border: "#25324D",
  },
  font: {
    sans: "var(--font-sans)",
    mono: "var(--font-mono)",
  },
} as const;

export const defaultTheme = {
  "--rb-navy": tokens.color.navy,
  "--rb-navy-2": tokens.color.navy2,
  "--rb-slate": tokens.color.slate,
  "--rb-red": tokens.color.red,
  "--rb-red-bright": tokens.color.redBright,
  "--rb-yellow": tokens.color.yellow,
  "--rb-yellow-soft": tokens.color.yellowSoft,
  "--rb-lime": tokens.color.lime,
  "--rb-text": tokens.color.text,
  "--rb-text-muted": tokens.color.textMuted,
  "--rb-border": tokens.color.border,
} as const;

export type ThemeVars = Record<`--rb-${string}`, string>;

export function tenantTheme(input: {
  primaryColor?: string | null;
  accentColor?: string | null;
  background?: string | null;
}): ThemeVars {
  const vars: ThemeVars = { ...defaultTheme };
  if (input.background) vars["--rb-navy"] = input.background;
  if (input.primaryColor) vars["--rb-red"] = input.primaryColor;
  if (input.accentColor) vars["--rb-yellow"] = input.accentColor;
  return vars;
}
