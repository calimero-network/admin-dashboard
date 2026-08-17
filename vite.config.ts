import { defineConfig } from 'vitest/config';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { execSync } from 'child_process';

/**
 * The dashboard's version.
 *
 * `package.json`'s version is not usable: `.releaserc.json` has no
 * `@semantic-release/npm` plugin, so it stays `0.0.0-development`. CI passes
 * `DASHBOARD_VERSION` (the version semantic-release is about to publish);
 * otherwise we fall back to the latest tag.
 *
 * Deliberately `--abbrev=0`: just the tag, never `-<n>-g<sha>-dirty`. The UI
 * shows a version, not a build fingerprint.
 */
function resolveVersion(): string {
  const fromEnv = process.env['DASHBOARD_VERSION'];
  if (fromEnv) return fromEnv.startsWith('v') ? fromEnv : `v${fromEnv}`;
  try {
    return execSync('git describe --tags --abbrev=0', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return 'dev';
  }
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
        404: resolve(__dirname, 'public/404.html'),
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
