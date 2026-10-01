import { defineConfig } from 'vitest/config';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { readFileSync } from 'fs';

/**
 * The dashboard's version: `DASHBOARD_VERSION` when set, else the
 * `package.json` version, which is what a release is cut from.
 */
function resolveVersion(): string {
  const fromEnv = process.env['DASHBOARD_VERSION'];
  if (fromEnv) return fromEnv.startsWith('v') ? fromEnv : `v${fromEnv}`;
  try {
    const pkg = JSON.parse(
      readFileSync(resolve(__dirname, 'package.json'), 'utf8'),
    ) as { version?: string };
    if (pkg.version) return `v${pkg.version}`;
  } catch {
    return 'dev';
  }
  return 'dev';
}

// https://vitejs.dev/config/
export default defineConfig({
  base: '/admin-dashboard/',
  define: {
    __DASHBOARD_VERSION__: JSON.stringify(resolveVersion()),
  },
  build: {
    outDir: 'build',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },
  plugins: [nodePolyfills(), react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Playwright specs live in e2e/ and must not be collected by vitest.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
