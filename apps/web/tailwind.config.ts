import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#111110",
          900: "#111110",
          800: "#2b2a27",
          700: "#5a5854",
          600: "#6f6d67",
          500: "#8a8881",
          400: "#b5b2a9",
          300: "#cbc8bf",
          200: "#e0ddd4",
          100: "#e8e4db",
          50: "#f3f0e9",
        },
        paper: {
          DEFAULT: "#ffffff",
          tinted: "#f1ede5",
          sunken: "#f8f6f1",
        },
        status: {
          red: "#b9341a",
          amber: "#b07b0c",
          green: "#2f6a3a",
        },
      },
      fontFamily: {
        sans: ["Hanken Grotesk", "system-ui", "-apple-system", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "SF Mono", "Menlo", "monospace"],
      },
      borderRadius: {
        sm: "2px",
        DEFAULT: "4px",
        md: "6px",
      },
    },
  },
} satisfies Config;
