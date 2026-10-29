/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        tinta: { DEFAULT: '#0F2238', 50: '#F2F5F9', 100: '#E3E9F1', 200: '#C5D1E1', 300: '#93A7C2', 400: '#5F7799', 500: '#3E5576', 600: '#2A3F5C', 700: '#1D3049', 800: '#142B4A', 900: '#0F2238', 950: '#09182A' },
        menta: { DEFAULT: '#0F9F94', 50: '#ECFBF9', 100: '#CFF5F0', 200: '#9FE9E0', 300: '#62D6C9', 400: '#2FBCAE', 500: '#0F9F94', 600: '#0B8078', 700: '#0D6661', 800: '#0F514E', 900: '#0F4341' },
        arena: { DEFAULT: '#F7F4EF', 50: '#FCFBF8', 100: '#F7F4EF', 200: '#EDE7DC', 300: '#DDD3C2' },
        coral: { DEFAULT: '#E4572E', 50: '#FDF1EC', 100: '#FBDDD2', 500: '#E4572E', 600: '#C8441F', 700: '#A3361A' },
      },
      fontFamily: {
        sans: ['Manrope', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Arial', 'sans-serif'],
        display: ['Archivo', 'Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: { suave: '0 1px 2px rgba(15,34,56,.06), 0 8px 24px -12px rgba(15,34,56,.18)' },
    },
  },
  plugins: [],
};
