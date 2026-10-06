import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0f4ff",
          100: "#dbe4ff",
          200: "#bac8ff",
          300: "#91a7ff",
          400: "#748ffc",
          500: "#5c7cfa",
          600: "#4c6ef5",
          700: "#4263eb",
          800: "#3b5bdb",
          900: "#364fc7",
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
