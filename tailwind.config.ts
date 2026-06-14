import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        orange: {
          DEFAULT: "#FF6B2C",
          dark: "#E55A1C",
          bg: "#FFF5F0",
          border: "#FFE8D9"
        },
        ink: "#1A1A1A",
        warm: "#FAFAFA"
      },
      fontFamily: {
        sans: ['"Noto Sans TC"', "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"]
      }
    }
  },
  plugins: []
};

export default config;
