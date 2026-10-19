import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    borderRadius: {
      none: "0",
      sm: "0",
      DEFAULT: "0",
      md: "0",
      lg: "0",
      xl: "0",
      "2xl": "0",
      "3xl": "0",
      full: "0",
    },
    extend: {
      colors: {
        navy: "rgb(var(--rb-navy) / <alpha-value>)",
        navy2: "rgb(var(--rb-navy-2) / <alpha-value>)",
        slate: "rgb(var(--rb-slate) / <alpha-value>)",
        slate2: "rgb(var(--rb-slate-2) / <alpha-value>)",
        primary: "rgb(var(--rb-blue) / <alpha-value>)",
        primarysoft: "rgb(var(--rb-blue-2) / <alpha-value>)",
        accent: "rgb(var(--rb-blue-light) / <alpha-value>)",
        green: "rgb(var(--rb-green) / <alpha-value>)",
        lime: "rgb(var(--rb-green-bright) / <alpha-value>)",
        brand: "rgb(var(--rb-red) / <alpha-value>)",
        brandbright: "rgb(var(--rb-red-bright) / <alpha-value>)",
        amber: "rgb(var(--rb-blue-light) / <alpha-value>)",
        ambersoft: "rgb(var(--rb-blue-2) / <alpha-value>)",
        logogreen: "#019B69",
        logoblue: "#0052BE",
        ink: "rgb(var(--rb-text) / <alpha-value>)",
        muted: "rgb(var(--rb-text-muted) / <alpha-value>)",
        line: "rgb(var(--rb-border) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
      boxShadow: {
        panel: "none",
      },
      keyframes: {
        flashUp: {
          "0%": { backgroundColor: "rgba(0,230,118,0.22)" },
          "100%": { backgroundColor: "transparent" },
        },
        flashDown: {
          "0%": { backgroundColor: "rgba(224,71,76,0.22)" },
          "100%": { backgroundColor: "transparent" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        pulseDot: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.25" },
        },
      },
      animation: {
        flashUp: "flashUp 0.6s ease-out",
        flashDown: "flashDown 0.6s ease-out",
        marquee: "marquee 45s linear infinite",
        pulseDot: "pulseDot 1.8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
