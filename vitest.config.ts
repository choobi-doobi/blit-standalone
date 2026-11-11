import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['client/**/*.test.{ts,tsx}', 'server/**/*.test.ts'],
  },
});
