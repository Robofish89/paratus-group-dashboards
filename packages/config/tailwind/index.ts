import type { Config } from "tailwindcss";

const paratusPreset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#003B73",
          50: "#E6EEF5",
          100: "#CCDDEa",
          200: "#99BBD6",
          300: "#6699C1",
          400: "#3377AD",
          500: "#003B73",
          600: "#00325F",
          700: "#00264A",
          800: "#001A36",
          900: "#000D21",
        },
        secondary: {
          DEFAULT: "#0072CE",
          50: "#E6F1FA",
          100: "#CCE3F5",
          200: "#99C7EB",
          300: "#66ABE1",
          400: "#338FD7",
          500: "#0072CE",
          600: "#005EA8",
          700: "#004A82",
          800: "#00365C",
          900: "#002236",
        },
        accent: {
          DEFAULT: "#F7941D",
          50: "#FEF4E8",
          100: "#FDE9D1",
          200: "#FBD3A3",
          300: "#F9BD75",
          400: "#F7A747",
          500: "#F7941D",
          600: "#D07A14",
          700: "#A9600F",
          800: "#82460A",
          900: "#5B2C05",
        },
        neutral: {
          50: "#F8F9FA",
          100: "#F1F3F5",
          200: "#E9ECEF",
          300: "#DEE2E6",
          400: "#CED4DA",
          500: "#ADB5BD",
          600: "#868E96",
          700: "#495057",
          800: "#343A40",
          900: "#212529",
        },
      },
    },
  },
};

export default paratusPreset;
