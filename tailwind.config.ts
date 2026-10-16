import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: ["class", '[data-theme="slate-dark"]'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "var(--primary)",
          hover: "var(--primary-hover)",
          light: "var(--primary-light)",
          border: "var(--primary-border)",
        },
        secondary: "var(--secondary)",
        accent: {
          DEFAULT: "var(--accent)",
          light: "var(--accent-light)",
        },
        app: {
          bg: "var(--bg-app)",
          surface: "var(--bg-surface)",
          subtle: "var(--bg-surface-subtle)",
        },
        content: {
          main: "var(--text-main)",
          muted: "var(--text-muted)",
          subtle: "var(--text-subtle)",
        },
        border: "var(--border-color)",
      },
      fontFamily: {
        sans: ["var(--font-noto-sans-jp)", "var(--font-plus-jakarta)", "sans-serif"],
        display: ["var(--font-plus-jakarta)", "var(--font-noto-sans-jp)", "sans-serif"],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
      },
    },
  },
  plugins: [],
};

export default config;
