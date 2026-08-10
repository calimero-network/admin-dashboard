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

/** The raw `git describe` output, e.g. `v1.12.4` or `v1.12.4-2-gcdd9ed0-dirty`. */
export const DASHBOARD_BUILD: string =
  typeof __DASHBOARD_VERSION__ === 'string' ? __DASHBOARD_VERSION__ : 'dev';

/**
 * Condense `git describe` for the header badge.
 *
 * A released build sits exactly on a tag and yields `v1.12.4`, which needs no
 * help. Anything else yields `v1.12.4-<commits>-g<sha>[-dirty]`, which is too
 * long for a 56px header, so keep the tag and the sha and drop the commit count:
 * `v1.12.4+cdd9ed0`.
 */
export function formatBuild(describe: string): string {
  const dirty = describe.endsWith('-dirty');
  const base = dirty ? describe.slice(0, -'-dirty'.length) : describe;

  // `-<n>-g<sha>` suffix from git describe.
  const match = /^(.*)-\d+-g([0-9a-f]+)$/.exec(base);
  const short = match ? `${match[1]}+${match[2]}` : base;

  return dirty ? `${short}*` : short;
}

export const DASHBOARD_VERSION: string = formatBuild(DASHBOARD_BUILD);
