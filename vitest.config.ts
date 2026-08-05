import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    // Logic and PDF tests stay in node; component tests opt into jsdom with a
    // `@vitest-environment jsdom` docblock so they don't slow the rest down.
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx']
  }
});
