import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Paratus brand colors available as utility classes alongside CSS variable-based theme
      colors: {
        "paratus-blue": {
          DEFAULT: "#003B73",
          light: "#0072CE",
        },
        "paratus-orange": {
          DEFAULT: "#F7941D",
        },
      },
    },
  },
  plugins: [],
};

export default config;
