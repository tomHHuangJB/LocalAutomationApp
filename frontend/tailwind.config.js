/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"] ,
  theme: {
    extend: {
      colors: {
        ink: "#1c1b22",
        ember: "#f45b2a",
        tide: "#1f6feb",
        moss: "#0f766e"
      }
    }
  },
  plugins: []
};
