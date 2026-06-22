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
        warm: "#FAFAF8"
      },
      fontFamily: {
        sans: ['"Noto Sans TC"', "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"]
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)"
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        float: "var(--shadow-float)"
      },
      maxWidth: {
        content: "var(--content-max)",
        "content-wide": "var(--content-max-wide)"
      },
      spacing: {
        tabbar: "var(--tabbar-h)",
        appbar: "var(--appbar-h)",
        "safe-bottom": "var(--safe-bottom)",
        "safe-top": "var(--safe-top)"
      }
    }
  },
  plugins: []
};

export default config;
