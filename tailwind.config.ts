import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      // A very light glow instead of coloured side bars (left borders) on cards, quotes and selected items.
      boxShadow: {
        "glow-brand": "0 0 0 1px rgb(3 121 71 / 0.10), 0 2px 14px -2px rgb(3 121 71 / 0.22)",
        "glow-brand-strong": "0 0 0 1px rgb(3 121 71 / 0.16), 0 4px 20px -2px rgb(3 121 71 / 0.30)",
        "glow-accent": "0 0 0 1px rgb(32 201 151 / 0.14), 0 2px 12px -2px rgb(32 201 151 / 0.24)",
        "glow-amber": "0 0 0 1px rgb(245 158 11 / 0.14), 0 2px 12px -2px rgb(245 158 11 / 0.24)",
        "glow-gray": "0 0 0 1px rgb(107 114 128 / 0.10), 0 2px 12px -2px rgb(107 114 128 / 0.16)",
      },
      colors: {
        // Plum brand, derived from #571d61 (chosen on the design canvas).
        brand: {
          50: "#eef7f1",
          100: "#dcefe4",
          200: "#bcdccb",
          300: "#7fb59b",
          400: "#4f9a78",
          500: "#2a6a4e",
          600: "#037947",
          700: "#183c2d",
          800: "#122e22",
          900: "#0c2018",
        },
        accent: {
          50: "#e6fcf5",
          100: "#c3fae8",
          200: "#96f2d7",
          300: "#63e6be",
          400: "#38d9a9",
          500: "#20c997",
          600: "#12b886",
          700: "#0ca678",
          800: "#099268",
          900: "#087f5b",
        },
        // Provenance of text in a thesis: AI-assisted, quoted/pasted, written by the student.
        prov: {
          ai: "#7c3aed",
          "ai-deep": "#5b21b6",
          "ai-soft": "#f5f3ff",
          "ai-line": "#ddd6fe",
          paste: "#f59e0b",
          "paste-deep": "#b45309",
          human: "#20c997",
        },
        // Neutral well behind the template thumbnails in the paper gallery (`bg-paper-well`).
        paper: {
          well: "#eef2ef",
        },
        // Editor area behind the page (CLAUDE.md §4, `.docs-workspace`): `bg-workspace`.
        workspace: "#f1f3f4",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Cal Sans", "Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
