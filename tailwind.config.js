/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: "#003d9b",
        "primary-container": "#0052cc",
        "on-primary": "#ffffff",
        secondary: "#4c616c",
        tertiary: "#004f11",
        "tertiary-fixed": "#a3f69c",
        surface: "#f8f9fb",
        "surface-container": "#edeef0",
        "surface-container-low": "#f3f4f6",
        "surface-container-high": "#e7e8ea",
        "surface-container-highest": "#e1e2e4",
        "surface-container-lowest": "#ffffff",
        "on-surface": "#191c1e",
        "on-surface-variant": "#434654",
        outline: "#737685",
        "outline-variant": "#c3c6d6",
        error: "#ba1a1a",
        "error-container": "#ffdad6",
      },
    },
  },
  plugins: [],
};
