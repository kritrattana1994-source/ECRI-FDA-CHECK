/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Sarabun', 'Outfit', 'sans-serif'],
        display: ['Outfit', 'Sarabun', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
