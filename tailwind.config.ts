import type { Config } from "tailwindcss";

// Thesisfic visual tokens. Every colour used in components comes from here (or from the provenance tokens below);
// the only literal hex values outside this file are canvases, the quality seal and AI-provider colours.
const aubergine = "#2B1F2D"; // primary
const smokyPlum = "#493847"; // secondary
const plumMid = "#3B293C"; // middle stop of the institutional (dark) gradient
const plumLight = "#60445A"; // focus rings, heading gradient end
const plumTint = "#F1EDF1"; // subtle plum tint for badges and soft backgrounds
const ivory = "#F5F2ED";
const anthracite = "#282A30";
const muted = "#66636A";
const border = "#E7E2DF";
const bronze = "#A5856A";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      // A very light glow instead of coloured side bars (left borders) on cards, quotes and selected items.
      boxShadow: {
        "glow-brand": "0 0 0 1px rgb(43 31 45 / 0.10), 0 2px 14px -2px rgb(43 31 45 / 0.20)",
        "glow-brand-strong": "0 0 0 1px rgb(43 31 45 / 0.16), 0 4px 20px -2px rgb(43 31 45 / 0.28)",
        "glow-accent": "0 0 0 1px rgb(32 201 151 / 0.14), 0 2px 12px -2px rgb(32 201 151 / 0.24)",
        "glow-amber": "0 0 0 1px rgb(245 158 11 / 0.14), 0 2px 12px -2px rgb(245 158 11 / 0.24)",
        "glow-gray": "0 0 0 1px rgb(107 114 128 / 0.10), 0 2px 12px -2px rgb(107 114 128 / 0.16)",
      },
      colors: {
        // Plum scale: 600 is the primary aubergine, 500 the smoky plum, 50 the tint.
        brand: {
          50: plumTint,
          100: "#E6DFE5",
          200: "#CFC3CD",
          300: "#A892A5",
          400: plumLight,
          500: smokyPlum,
          600: aubergine,
          700: plumMid,
          800: "#231A25",
          900: "#19121B",
        },
        // Warm neutrals: ivory surfaces, warm borders, anthracite text.
        gray: {
          50: ivory,
          100: "#EDE9E4",
          200: border,
          300: "#D3CDC9",
          400: "#9C979B",
          500: muted,
          600: "#524F55",
          700: "#3E3C42",
          800: "#323138",
          900: anthracite,
        },
        ivory,
        bronze,
        plum: { DEFAULT: aubergine, smoky: smokyPlum, mid: plumMid, light: plumLight, tint: plumTint },
        // Student text, checks and success keep the green accent.
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
        // Provenance of text in a thesis: AI-assisted, quoted/pasted, written by the student. Never restyled.
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
      backgroundImage: {
        "brand-primary": `linear-gradient(135deg, ${aubergine} 0%, ${smokyPlum} 100%)`,
        "brand-dark": `linear-gradient(135deg, ${aubergine} 0%, ${plumMid} 55%, ${smokyPlum} 100%)`,
        "brand-light": `linear-gradient(145deg, #FFFFFF 0%, ${ivory} 100%)`,
        "brand-heading": `linear-gradient(110deg, ${aubergine} 0%, ${plumLight} 100%)`,
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Playfair Display", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;
