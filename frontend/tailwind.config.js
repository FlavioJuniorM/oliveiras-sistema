/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Paleta oficial Casa de Carnes Oliveiras
        primary: {
          DEFAULT: "#C8102E",
          dark: "#8B0D1F",
        },
        background: "#F3F3F3",
        surface: "#FFFFFF",
        ink: {
          DEFAULT: "#111111",
          soft: "#1C1C1C",
        },
        // Dourado da marca para fundos/bordas; "texto" é a versão escura legível
        // (contraste ≥ 5:1 sobre branco — o dourado claro tinha só 2,2:1)
        gold: {
          DEFAULT: "#D4A72C",
          texto: "#7D5F0E",
          light: "#E8C766",
        },
        muted: "#6B6B6B",
        border: "#E5E5E5",
        success: "#198754",
        warning: "#D4A72C",
        danger: "#DC3545",
      },
      fontFamily: {
        display: ["'Oswald'", "sans-serif"],
        body: ["'Inter'", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(17, 17, 17, 0.04), 0 1px 3px rgba(17, 17, 17, 0.06)",
      },
      borderRadius: {
        card: "10px",
      },
    },
  },
  plugins: [],
};
