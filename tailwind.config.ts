import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        midnight: '#030712',
        sky: '#0ea5e9',
        petrol: '#1e293b',
      },
      boxShadow: {
        glow: '0 20px 80px rgba(14, 165, 233, 0.16)',
      },
      keyframes: {
        fadeUp: {
          '0%':   { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeRight: {
          '0%':   { opacity: '0', transform: 'translateX(24px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        breathe: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.4' },
        },
      },
      animation: {
        'fade-up':    'fadeUp    0.5s cubic-bezier(0.16, 1, 0.3, 1) both',
        'fade-in':    'fadeIn    0.5s cubic-bezier(0.16, 1, 0.3, 1) both',
        'fade-right': 'fadeRight 0.6s cubic-bezier(0.16, 1, 0.3, 1) both',
        'breathe':    'breathe   4s   ease-in-out                   infinite',
      },
    },
  },
  plugins: [],
};

export default config;
