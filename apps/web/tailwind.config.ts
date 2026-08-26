import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        myrealtrip: {
          blue: '#2B6BEF',
          mint: '#18B6A4',
          ink: '#172033',
        },
      },
      boxShadow: {
        block: '0 10px 30px rgba(23, 32, 51, 0.08)',
      },
    },
  },
  plugins: [],
} satisfies Config;
