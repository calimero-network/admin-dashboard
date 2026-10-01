/**
 * The dashboard's version, injected by vite.config.ts from `DASHBOARD_VERSION`
 * or the `package.json` version.
 *
 * It is the version and nothing else: no commit count, no sha, no dirty marker.
 */
declare const __DASHBOARD_VERSION__: string;

export const DASHBOARD_VERSION: string =
  typeof __DASHBOARD_VERSION__ === 'string' && __DASHBOARD_VERSION__
    ? __DASHBOARD_VERSION__
    : 'dev';
