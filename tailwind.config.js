/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Avenir Next"', 'Futura', '"Trebuchet MS"', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 10px 30px -12px rgba(14, 116, 144, 0.45)',
      },
    },
  },
  plugins: [],
}
