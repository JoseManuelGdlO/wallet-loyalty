import animate from "tailwindcss-animate";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#102033",
        mist: "#E7EEF2",
        paper: "#F7FAFB",
        brass: "#A56B2A",
        seal: "#0E6B62",
      },
      fontFamily: {
        display: ["Fraunces", "serif"],
        sans: ["Outfit", "sans-serif"],
      },
      boxShadow: {
        card: "0 18px 40px rgba(16, 32, 51, 0.08)",
      },
    },
  },
  plugins: [animate],
};
