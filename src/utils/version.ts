/**
 * The dashboard's version.
 *
 * `package.json` is not a source of truth: `.releaserc.json` has no
 * `@semantic-release/npm` plugin, so the version there stays
 * `0.0.0-development` forever. The value is injected by vite.config.ts — from
 * `DASHBOARD_VERSION` when CI supplies the release version, otherwise from the
 * latest git tag.
 *
 * It is the version and nothing else: no commit count, no sha, no dirty marker.
 */
declare const __DASHBOARD_VERSION__: string;

export const DASHBOARD_VERSION: string =
  typeof __DASHBOARD_VERSION__ === 'string' && __DASHBOARD_VERSION__
    ? __DASHBOARD_VERSION__
    : 'dev';
