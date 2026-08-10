/**
 * Build identity for this dashboard bundle.
 *
 * `package.json` is NOT a source of truth here: `.releaserc.json` has no
 * `@semantic-release/npm` plugin, so the version there stays
 * `0.0.0-development` forever. The value is injected by vite.config.ts from
 * `git describe`, or from `DASHBOARD_VERSION` when CI provides it.
 *
 * Note there is deliberately no *node* version shown alongside it:
 * `GET /admin-api/health` returns only `{ data: { status } }` (see
 * core/crates/server/src/admin/service.rs), and core exposes no version route.
 */
declare const __DASHBOARD_VERSION__: string;

export const DASHBOARD_VERSION: string =
  typeof __DASHBOARD_VERSION__ === 'string' ? __DASHBOARD_VERSION__ : 'dev';
