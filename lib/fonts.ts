import localFont from "next/font/local";

export const vazirmatn = localFont({
  src: "../public/fonts/vazirmatn-variable.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  preload: true,
  variable: "--font-vazirmatn",
  fallback: ["Tahoma", "Arial", "sans-serif"],
});

export const estedad = localFont({
  src: "../public/fonts/estedad-semibold.woff2",
  weight: "600",
  style: "normal",
  display: "swap",
  preload: true,
  variable: "--font-estedad",
  fallback: ["Vazirmatn", "Tahoma", "Arial", "sans-serif"],
});
