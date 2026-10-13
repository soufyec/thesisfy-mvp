import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Plum brand, derived from #571d61 (chosen on the design canvas).
        brand: {
          50: "#f6eff8",
          100: "#ead9ee",
          200: "#d9bfe0",
          300: "#b07cba",
          400: "#8f3f9c",
          500: "#6f2a7b",
          600: "#571d61",
          700: "#46174e",
          800: "#35113b",
          900: "#2a0d2f",
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
