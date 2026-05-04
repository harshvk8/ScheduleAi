import type { Config } from 'tailwindcss';

const config: Config = {
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
    },
  },
  plugins: [],
};

export default config;
