/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './client/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'rgb(128 128 128 / 0.35)',
      },
      zIndex: {
        drawer: '30',
      },
    },
  },
  plugins: [],
};
