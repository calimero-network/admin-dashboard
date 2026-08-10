# Plan: bring `admin-dashboard` to 1:1 parity with Calimero Desktop

**Date:** 2026-08-10
**Source of truth for design + features:** `tauri-app/apps/desktop` @ `chore/bump-0.0.83-merod-rc20` (0e5d90b)
**Target:** `admin-dashboard` @ `master` (ff1574e, v1.12.4)

**Goal.** The web admin dashboard should look and behave like Calimero Desktop, with three deliberate divergences:

1. Apps open in **new browser tabs**, not Tauri windows.
2. The dashboard is bound to **exactly one node** — all multi-node create/start/stop/select UI is removed.
3. Node logs are **not obtainable over HTTP** (proven below) — the Logs feature must be replaced, not ported.

---

## Implementation status (updated 2026-08-10)

Phases 0–3 are **implemented** on `feat/desktop-parity-shell-open-apps`. Phase 4–5 remain open.

| Phase                                                                       | Status                                                         |
| --------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 0 — dead-code cleanup + fix pre-existing `tsc` errors                       | ✅ done (55 unreachable files removed; 13 → 0 type errors)     |
| 1 — design tokens, light theme, shell, shared components                    | ✅ done                                                        |
| 2 — open apps in new tabs, DataTable Applications, ConfirmAction, Home grid | ✅ done                                                        |
| 3 — Settings page, multi-registry Marketplace with cache/version picker     | ✅ done                                                        |
| 4 — Node diagnostics page                                                   | ✅ done (brought forward; it was cheap once the shell existed) |
| 4 — Namespaces tree/stat-cards parity, restyle Contexts/Blobs/Identity      | ⬜ open                                                        |
| 4 — optional first-run onboarding                                           | ⬜ open                                                        |
| 5 — Cloud/HA, AI-agent tab, core `/admin-api/logs`                          | ⬜ open                                                        |

**Decisions taken** (§8): D1 keep `calimero-client`; D2 adopt `lucide-react`; D3 desktop's
system/Inter stack, Google Fonts `@import` removed; D4 keep the redirect login (restyled);
D5 Logs option A (page deleted); D6 Namespaces + Contexts always visible, Node page dev-gated.

### Two claims in this plan turned out to be wrong

1. **§5.2 said the Node page could show a node "version" from `/admin-api/health`.** It cannot.
   That handler returns only `{ data: { status } }` (`core/crates/server/src/admin/service.rs`),
   and core exposes no version route at all. The header badge shows the _dashboard_ build stamp
   (`git describe`, injected by `vite.config.ts`) instead; no node version is displayed anywhere.
2. **§3.3 implied the registry list response shape was ambiguous.** It is not: `GET /api/v2/bundles`
   returns a **bare array**. Verified against `app-registry`'s own client
   (`packages/frontend/src/lib/api.ts` does `Array.isArray(response.data) ? … : []`) and its
   local-server contract. The desktop's `registry.ts` is correct; the old admin code's
   `data.bundles || []` fallback was dead defensive code, and it has not been carried over.

### Bugs found and fixed during implementation (beyond the ones in §6)

- **`window.open(url, name, 'noopener')` returns `null` per spec.** The first cut of
  `openAppInNewTab` passed `noopener` in the feature string, so it never got a window handle:
  every "Open" click threw a bogus "popup blocked" error and left an empty tab behind. The opener
  is now severed with `tab.opener = null` while the tab is still on `about:blank`. Caught by e2e,
  guarded by a unit test.
- **`custom.d.ts` typed `*.svg` as a React component.** With no svgr plugin, Vite returns a URL
  string; call sites were casting `as unknown as string` to compensate. Declaration corrected.
- **`.env` set `VITE_NODE_URL=http://localhost:2428`** — the libp2p swarm port, not the admin API
  port. Corrected to 2528.
- **A stale `VITE_NODE_URL` outranked the serving origin in dev**, pointing every admin-API call
  and every SSO hash at the wrong port. The origin now wins whenever the app is node-served.
- **The sidebar's Settings link never set `aria-current`**, unlike the other nav items.
- **`release.yml` pinned pnpm 8 against a `lockfileVersion: 9.0` lockfile**, so the release build
  silently regenerated its own dependency tree instead of installing the pinned one. Bumped to 9.

### Pre-existing feature loss noticed, not caused, by this work

`components/identity/PermissionsDialog.tsx` (434 lines) and `IdentityRowItem.tsx` were already
unreachable from `main.tsx` before this PR — `IdentityTable` renders rows itself and never imports
them. So the client-key permissions editor is **already** dead in the shipped dashboard. Both files
were removed with the rest of the orphaned cluster; reinstating a permissions editor on the new
`DataTable` is worth a follow-up issue.

---

## 0. Executive summary

| Area           | Verdict                                                                                                                                                                                                  |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Design system  | Admin already uses the same _palette_ (`#0d1117` / `#a5ff11`) but a **different, thinner design system**. Needs a full token + shell + component port. ~8,200 lines of desktop CSS vs ~1,870 in admin.   |
| Shell / layout | Admin has no app shell, no header, no node-status indicator, no theme switch, no toasts, no error boundary, no skeletons, no sortable table, no context menus. All 14 desktop components must be ported. |
| Light theme    | Desktop has a **full light theme** (`[data-theme="light"]`). Admin is dark-only. Biggest single visual gap.                                                                                              |
| Open apps      | Admin has **no way to open an installed app at all**. Highest-value new feature.                                                                                                                         |
| Nodes tab      | Cannot be ported as-is (multi-node lifecycle is Tauri-only). Replace with a single-node **read-only** Node page — real endpoints exist (`/health`, `/peers`, `/network/status`, `/usage`).               |
| Logs           | **Impossible over HTTP.** Core exposes no logs route. Tauri reads a file it wrote itself. Three fallback options in §5.3.                                                                                |
| Marketplace    | Admin is a cut-down version: no multi-registry, no cache, no version picker, no detail modal, no install filter pills.                                                                                   |
| Applications   | Admin's metadata parser reads the **wrong schema** — every bundle-installed app shows a blank name (real bug, §6.1).                                                                                     |
| Settings       | Admin has **no Settings page at all**.                                                                                                                                                                   |
| Onboarding     | Desktop's onboarding is 90% embedded-node setup — mostly not portable. §5.4.                                                                                                                             |
| Dead code      | ~9 orphaned pages/components in admin, 1 dead page in desktop (`Nodes.tsx`).                                                                                                                             |

---

## 1. What each app is today

### 1.1 Stack

|              | Desktop                                                 | Admin dashboard                                                                                                                                                                                        |
| ------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| React        | 19.2                                                    | 18.3                                                                                                                                                                                                   |
| SDK          | `@calimero-network/mero-js` 2.2.1 + `mero-react` 2.4.0  | `@calimero-network/calimero-client` 1.25.0-beta.2                                                                                                                                                      |
| Icons        | `lucide-react`                                          | `@heroicons/react`                                                                                                                                                                                     |
| Routing      | manual `currentPage` state (no router)                  | `react-router-dom` 6 (`BrowserRouter`, basename `/admin-dashboard`)                                                                                                                                    |
| Styling      | plain CSS + CSS custom properties, per-component `.css` | same approach, but a separate/smaller token set; also `styled-components` + `bootstrap` still installed for legacy pages                                                                               |
| Build        | Vite 6, `dist/`                                         | Vite 6, `build/`, `base: '/admin-dashboard/'`                                                                                                                                                          |
| Distribution | Tauri bundle                                            | **baked into merod**: `core/crates/server/build.rs` downloads `admin-dashboard-build.zip` from GitHub releases; served at `<nodeUrl>/admin-dashboard/` (`core/crates/server/src/admin/service.rs:405`) |

> **Consequence of the last row:** the dashboard is _served by the node it administers_. `window.location.origin` already **is** the node URL. This is the architectural reason single-node binding is correct, and it lets us delete the "Connect to Node" step entirely (§5.2).

### 1.2 Page inventory

**Desktop** (`apps/desktop/src/pages/`)

| File                 | Lines | Status                           |
| -------------------- | ----- | -------------------------------- |
| `Namespaces.tsx`     | 2212  | live                             |
| `Onboarding.tsx`     | 1417  | live                             |
| `Settings.tsx`       | 871   | live                             |
| `Marketplace.tsx`    | 760   | live                             |
| `NodeManagement.tsx` | 623   | live (the "Nodes" tab)           |
| `Nodes.tsx`          | 506   | **dead** — not imported anywhere |
| `InstalledApps.tsx`  | 396   | live                             |
| `ConfirmAction.tsx`  | 72    | live                             |

**Desktop components** (all 14 need porting or an explicit "skip" decision):
`ContextMenu`, `DataTable`, `ErrorBoundary`, `Icons`, `LoginView`, `LogsViewer`, `NodeStatusIndicator`, `ProviderSelector`, `ScrollHint`, `Sidebar`, `Skeleton`, `ToastContainer`, `UpdateNotification`, `UsernamePasswordForm`
**Desktop contexts:** `ThemeContext`, `ToastContext`

**Admin dashboard** — routed pages (`src/App.tsx`): `Dashboard`, `NewMarketplace`, `Applications`, `Blobs`, `Contexts`, `Namespaces`, `Identity`, `Identity/root-key[/:providerId]`, `NotFound`. Plus `ConnectPage` + `LoginPage` via `AuthWrapper`.

**Admin dead code** (not routed, not reachable):
`pages/AddRelease.tsx`, `pages/JoinContext.tsx`, `pages/Logs.tsx`, `pages/StartContext.tsx`, `pages/ApplicationDetails.tsx`, `pages/InstallApplication.tsx`†, `pages/PublishApplication.tsx`†, `components/publishApplication/*`, `components/applications/*` (legacy row/table components), `components/context/*` (legacy), `components/layout/ContentWrapper.tsx` + `components/footer/Footer.tsx`, `components/common/*` (most), `hooks/useNear.tsx`, `utils/wallet.ts`, `utils/starknetWalletType.ts`.

† still _referenced_ — but only for their exported TypeScript types (`AppMetadata`, etc.). They are not rendered.

---

## 2. Design-system gap (the "same design" half)

### 2.1 Token diff — `desktop/src/index.css` vs `admin/src/styles/index.css`

Admin already matches on: `--bg-primary`, `--text-*`, `--border-color`, `--accent-primary/hover/light`, `--success/error/warning/info`.

**Admin is missing entirely:**

| Token group           | Missing tokens                                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Surfaces              | `--bg-elevated`, `--surface-glass`, `--surface-glass-soft`, `--surface-glass-strong`, `--header-glass`, `--button-glass`, `--button-glass-hover` |
| Accents               | `--accent-dim`                                                                                                                                   |
| Shadows               | `--shadow-xl`, and `--shadow-glow` differs in intensity                                                                                          |
| Gradients             | `--gradient-primary`, `--gradient-secondary`, `--gradient-text`, `--gradient-surface`                                                            |
| Layout                | `--header-height: 56px`, `--radius-md`, `--radius-xl`                                                                                            |
| Background            | `--desktop-space-background` (+ `-size`/`-position`/`-repeat`) — the radial ambient glow behind the whole app; light mode adds a starfield       |
| **Whole light theme** | the entire `[data-theme="light"]` block (~48 tokens)                                                                                             |

**Naming collisions to reconcile** (admin's names differ, so a blind copy breaks existing pages):

- admin `--radius` (10px) ≙ desktop `--radius-md`; admin `--radius-lg` is 14px, desktop's is 16px
- admin `--bg-secondary` is a _translucent_ `rgba(22,27,34,.6)` and it keeps `--bg-secondary-solid`; desktop `--bg-secondary` is the solid `#161b22`
- admin `--sidebar-width: 220px`; desktop sidebar is a hardcoded `240px`

**Fonts:** admin loads DM Sans + Inter + JetBrains Mono from Google Fonts at runtime (`@import url(...)` at the top of `index.css`) and uses `'DM Sans'` first. Desktop uses `'Inter'` then system stack, no webfont request.
→ Decision needed (§8-D3). Note a Google Fonts `@import` is a **cross-origin runtime request from a page served by the node** — it will fail on air-gapped/offline nodes and silently degrade. Recommend self-hosting or dropping to the desktop's system stack.

**Utility classes admin lacks:** `.gradient-text`, `.card-glow`, keyframes `fadeUp` / `scaleIn` / `pulse-glow` / `float-orb-1..3`.

**Button system mismatch:** admin uses `.btn` / `.btn-primary` / `.btn-danger` / `.btn-sm` / `.btn-icon`. Desktop uses `.button` / `.button-primary` / `.button-secondary` / `.button-danger` / `.button-small` / `.button-success`. Admin has **no** secondary or success variant.
→ Port the desktop `.button*` set, then keep `.btn*` as aliases for one release so the ~80 existing call sites don't all have to change in one commit.

### 2.2 Shell / chrome gap

| Desktop                                                                                                                                                                                               | Admin today                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.app` → `.app-layout` → `Sidebar` + `.app-content` → `.header` + `.main`                                                                                                                             | each page renders `<div className="app-shell"><Navigation/><main className="page-content">` itself                                                                                                    |
| Fixed 56px header with page title + `v{appVersion}` badge + `NodeStatusIndicator`                                                                                                                     | no header; each page has its own `.page-header` block                                                                                                                                                 |
| Sidebar: 240px, logo as `<img>` from `assets/calimero-logo.svg` with `filter: brightness(0) invert(1)`, active item has a 3px left accent bar (`::before` + `scaleY`) and icon `scale(1.08)` on hover | Sidebar: 220px, **logo inlined as a giant hardcoded SVG in `Navigation.tsx`** with `fill="#fafafa"` baked in (breaks in light mode), active item uses border + glow, no accent bar, no icon animation |
| `ToastContainer` + `ToastContext` (success/error/warning/info, auto-dismiss, stacked, dismissible)                                                                                                    | each page has its own local `toast` state + `.alert` div, `setTimeout(3500)` — 4 independent copies (`NewMarketplace`, `Applications`, `Namespaces`, `Contexts`)                                      |
| `ErrorBoundary` wrapping Login / Settings, with `componentName` + reset                                                                                                                               | none                                                                                                                                                                                                  |
| `Skeleton` / `SkeletonText` / `SkeletonTable` components                                                                                                                                              | ad-hoc `.skel-line` divs                                                                                                                                                                              |
| `DataTable` — generic, sortable columns, `sortValue`, `compact`, row context menu, custom empty node                                                                                                  | none; hand-rolled `<div>` lists per page                                                                                                                                                              |
| `ContextMenu` (right-click, viewport-clamped, Esc/scroll/outside-click to close)                                                                                                                      | none                                                                                                                                                                                                  |
| `ScrollHint` ("scroll for more ↓" when a container overflows)                                                                                                                                         | none                                                                                                                                                                                                  |
| `ThemeContext` (light/dark, persisted at `calimero-desktop-theme`, sets `data-theme` on `<html>`)                                                                                                     | none                                                                                                                                                                                                  |

---

## 3. Feature gap, page by page

### 3.1 Home / Dashboard

| Desktop (`App.tsx` home branch)                                                          | Admin (`Dashboard.tsx`)                                          | Action                                                      |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------- |
| Welcome section + description                                                            | —                                                                | add                                                         |
| Node Status card w/ badge, error text, **"Restart Node"** button                         | status banner w/ dot + URL                                       | keep banner; **drop Restart** (no process control from web) |
| "Your Applications" grid — first 4 apps, **click to open the app**, "Open" hint on hover | —                                                                | **add** (core of §5.1)                                      |
| Empty state card → "Browse Marketplace"                                                  | —                                                                | add                                                         |
| Quick Actions grid (Marketplace / Applications / Settings)                               | Quick Actions grid (5 cards) — richer                            | keep admin's, restyle to `.action-card`                     |
| —                                                                                        | Stats grid: installed apps / contexts / namespaces / install-new | **keep** — better than desktop; restyle                     |
| —                                                                                        | Ecosystem links (website, download, registry, docs, GitHub)      | **keep**                                                    |
| health poll every 10s → tray icon + indicator                                            | one-shot fetch on mount                                          | add 10s poll → header indicator (no tray)                   |

### 3.2 Applications

| Desktop (`InstalledApps.tsx`)                                                          | Admin (`Applications.tsx`)                                                            |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `DataTable`: Name (+ truncated ID), Version, Size, Description, Actions — all sortable | flat `<div>` rows, no sorting                                                         |
| **"Open"** button per row → opens frontend                                             | **absent**                                                                            |
| Row overflow menu: Copy ID / Create launcher / Uninstall                               | inline Uninstall with confirm-in-place                                                |
| Right-click context menu (Open / Create launcher / Uninstall)                          | —                                                                                     |
| Skeleton table on load (min 1000ms so it doesn't flash)                                | 3 skeleton rows                                                                       |
| Uninstall → dedicated `ConfirmAction` page with breadcrumbs                            | inline "Confirm / Cancel" buttons                                                     |
| —                                                                                      | **guards uninstall when a context still uses the app** ← keep, desktop lacks this     |
| metadata via `decodeMetadata` → `{name, version, description, links.frontend, icon}`   | `parseAppMetadata` → `{applicationName, applicationVersion}` ← **wrong schema, §6.1** |

**To add:** Open action, `DataTable`, sorting, overflow menu, context menu, size column, `ConfirmAction` page, correct metadata decode.

### 3.3 Marketplace

| Desktop (`Marketplace.tsx`, 760 lines)                                                                         | Admin (`NewMarketplace.tsx`, 394)                              |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Multi-registry** — `settings.registries[]`, `fetchAppsFromAllRegistries`                                     | single hardcoded `VITE_SERVER_URL`                             |
| **localStorage cache** with stale-while-revalidate background refresh (`utils/marketplaceCache.ts`, 197 lines) | none — full refetch every mount                                |
| **App detail modal**: package ID, author, downloads, registry link, install from modal                         | none — cards only                                              |
| **Version picker** — `fetchAppVersions`, newest-non-yanked default, `<select>` when >1                         | always installs `bundle.appVersion`                            |
| Filter pills: All / Installed / Not Installed                                                                  | none                                                           |
| Search: name + description + id + author                                                                       | name + description + package                                   |
| Clear-search (×) button                                                                                        | none                                                           |
| "Explore Registry on web" button                                                                               | none                                                           |
| Refresh button with spin state                                                                                 | Refresh button                                                 |
| Card: icon wrapper w/ `Package` glyph, version badge, installed check, author, downloads                       | Card: first-letter avatar, version, package, author, downloads |
| Skeleton cards mirroring real card layout                                                                      | 4 generic skeleton lines                                       |
| `bs58` hash conversion, v1 `artifact` + v2 `artifacts[]`, mpk-vs-wasm metadata rule                            | **same logic, duplicated**                                     |
| 401 → reload to re-login                                                                                       | silent                                                         |

**Note:** admin has one thing desktop lacks — a **URL-by-convention fallback** when a manifest has no `artifacts` (`NewMarketplace.tsx:184`). Keep it.

### 3.4 Namespaces

Both implement namespaces → groups → subgroups → contexts → members, invitations, join/leave. Desktop: 2212 lines via `mero-react` hooks. Admin: 1590 lines + its own 329-line raw-fetch `api/namespaceApi.ts`.

**Desktop-only:**

- Stat cards (members / contexts / subgroups / upgrade policy) with explanatory tooltips
- Collapsible **tree view** of the whole structure (`renderTreeSubgroup`, nested contexts, per-node delete)
- Per-row actions dropdown (`MoreHorizontal`) instead of always-visible buttons
- **Create Context** and **Join Context** modals
- High Availability / TEE panel (cloud) — see §5.5
- `parseApiError` that unwraps SDK `bodyText` JSON into a human message
- Role colour coding, `nsDisplayName` alias resolution
- Bounded self-healing reconcile loop for disabled namespaces (cloud-only)

**Admin-only:** `setSubgroupVisibility` control with an explicit `open (public)` option (`Namespaces.tsx:781`) — keep; per the rc.19 notes, restricted-by-default subgroups 403 and the value must be lowercase `open`.

### 3.5 Settings

Admin has **no Settings page**. Desktop tabs:

| Desktop tab / field                                            | Port to web?                                                                                                                                 |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| General → Start at login                                       | ✗ Tauri autostart                                                                                                                            |
| General → **Dark Mode toggle**                                 | ✓                                                                                                                                            |
| General → Updates (check / install)                            | ✗ Tauri updater                                                                                                                              |
| General → **Developer Mode toggle**                            | ✓ (gates Namespaces/Contexts/Node-detail nav, same as desktop)                                                                               |
| General → Debug Logs                                           | ✗ rewrites merod launch flags                                                                                                                |
| General → Enable Cloud                                         | ✓ only if §5.5 lands                                                                                                                         |
| General → Reset app                                            | ~ becomes "clear local dashboard state" (localStorage + tokens), **not** node data                                                           |
| General → Total nuke (delete data dir)                         | ✗ filesystem                                                                                                                                 |
| **Registries** (add/remove, autosaved)                         | ✓ — required by §3.3 multi-registry                                                                                                          |
| AI Agent (mint client key, write credential file, MCP snippet) | ~ key minting is an API call and _is_ portable; **writing the file is not**. Downgrade to "show the credential, copy to clipboard". Phase 5. |
| Cloud (Google sign-in)                                         | ✗ as-is — `utils/cloudAuth.ts` uses 3 `invoke()` calls (loopback OAuth). Needs a web redirect flow.                                          |

New web-only Settings needs: **About** (dashboard version, merod version from `/health`, node URL).

### 3.6 Admin-only pages to keep (no desktop equivalent)

- **Contexts** (`Contexts.tsx`, 620) — create/delete contexts, invitations. Desktop only reaches contexts through Namespaces.
- **Blobs** (`Blobs.tsx`, 424) — list/upload/download/delete blobs.
- **Identity** (`Identity.tsx` + `IdentityTable` + `PermissionsDialog`, ~750) — root keys, client keys, permissions, add-root-key provider flow (NEAR / MetaMask / Starknet / ICP / username-password).

All three keep their features; they just get restyled onto the ported design system and the shared shell.

---

## 4. Straight component port list

| Desktop file                                                                                                                         | Lines (tsx+css) | Web port                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------ | --------------- | ------------------------------------------------------------------------------------- |
| `contexts/ThemeContext.tsx`                                                                                                          | 58              | as-is (rename storage key → `calimero-admin-theme`)                                   |
| `contexts/ToastContext.tsx`                                                                                                          | 86              | as-is                                                                                 |
| `components/ToastContainer.tsx/.css`                                                                                                 | 43 + 149        | as-is (swap lucide→heroicons if D2 says so)                                           |
| `components/Skeleton.tsx/.css`                                                                                                       | 106 + 134       | as-is                                                                                 |
| `components/DataTable.tsx/.css`                                                                                                      | 156 + 159       | as-is                                                                                 |
| `components/ContextMenu.tsx/.css`                                                                                                    | 83 + 49         | as-is                                                                                 |
| `components/ScrollHint.tsx/.css`                                                                                                     | 48 + 32         | as-is                                                                                 |
| `components/ErrorBoundary.tsx/.css`                                                                                                  | 157 + 165       | as-is                                                                                 |
| `components/Sidebar.tsx/.css`                                                                                                        | 60 + 123        | adapt — `<Link>` instead of `onNavigate`, admin's nav item list, add Logout to footer |
| `components/NodeStatusIndicator.tsx/.css`                                                                                            | 102 + 117       | **strip the multi-node dropdown** (§5.2); keep dot + label + tooltip                  |
| `components/LogsViewer.tsx/.css`                                                                                                     | 243 + 188       | **only if §5.3 Option B/C lands**                                                     |
| `components/ProviderSelector.tsx`                                                                                                    | 166             | port if D1 = adopt desktop login                                                      |
| `components/UsernamePasswordForm.tsx`                                                                                                | 118             | port if D1 = adopt desktop login                                                      |
| `components/LoginView.tsx`                                                                                                           | 180             | port if D1 = adopt desktop login                                                      |
| `components/UpdateNotification.tsx/.css`                                                                                             | 149 + 171       | ✗ Tauri updater                                                                       |
| `pages/ConfirmAction.tsx/.css`                                                                                                       | 72 + 109        | as-is                                                                                 |
| `utils/appUtils.ts` (`decodeMetadata`, `kebabCase`, `appendParamsToUrl`)                                                             | 251             | port the pure helpers; **rewrite `openAppFrontend`** (§5.1)                           |
| `utils/registry.ts`                                                                                                                  | 366             | as-is (plain `fetch`)                                                                 |
| `utils/marketplaceCache.ts`                                                                                                          | 197             | as-is                                                                                 |
| `utils/settings.ts`                                                                                                                  | 168             | adapt — drop every `embeddedNode*` field                                              |
| `utils/string.ts`, `utils/jwt.ts`, `utils/contextKeys.ts`                                                                            | 7 / 66 / 37     | as-is                                                                                 |
| `utils/cloudApi.ts`                                                                                                                  | 791             | portable (0 `invoke()`) — Phase 5                                                     |
| `utils/cloudAuth.ts`                                                                                                                 | 385             | 3 `invoke()` — needs web OAuth rewrite                                                |
| `utils/merod.ts`, `utils/hardReset.ts`, `utils/updater.ts`, `utils/teeEviction.ts`, `lib/token-broker.ts`, `hooks/useAppDeepLink.ts` | —               | ✗ Tauri-only (`teeEviction` is cloud-only)                                            |

---

## 5. The three web divergences

### 5.1 Opening apps → new tab (the headline feature)

**Desktop mechanism** (`utils/appUtils.ts:109`):

1. Prefer `invoke('open_app_launcher')` — a native per-app process with its own dock icon.
2. Fall back to `invoke('create_app_window')` — a Tauri webview with a stable label `app-<applicationId>`, focus/unminimise if already open.
3. Auth is handed over in the **URL hash**: `node_url`, `access_token`, `refresh_token`, `expires_at`, `app-id`, `context_id`, `executor_public_key`, `dev_mode`.
4. The refresh token sent is the sentinel `BROKERED_REFRESH_TOKEN`, **never the real one** — refresh tokens are single-use (core#3083), so the desktop keeps the only copy and brokers refreshes over Tauri IPC (`lib/token-broker.ts`).

**Web replacement.** There is no IPC and no way to proxy an app's `fetch` from another origin, so the broker cannot be ported. The sanctioned pattern is an **access-token-only hash**:

```ts
// src/utils/openApp.ts
export function openAppInNewTab(
  frontendUrl: string,
  opts: {
    applicationId?: string;
    contextId?: string;
    executorPublicKey?: string;
    devMode?: boolean;
  },
) {
  // 1. Open the tab SYNCHRONOUSLY inside the click handler or popup blockers kill it.
  const tab = window.open('about:blank', '_blank', 'noopener,noreferrer');
  if (!tab)
    throw new Error(
      'Popup blocked — allow pop-ups for this node to open apps.',
    );

  const nodeUrl = getNodeUrl(); // window.location.origin (§5.2)
  const h = new URLSearchParams();
  h.set('node_url', nodeUrl);
  const at = getAccessToken();
  if (at) h.set('access_token', at);
  // NO refresh_token. mero-react's resolveTokenAdoption merges access-only
  // bundles precisely because "hosts are dropping refresh_token from the SSO
  // hash" (mero-react/src/auth/token-adoption.ts:132). Sending the real one
  // would let the app tab rotate it, and the node then reads OUR next refresh
  // as token_reuse and revokes the whole family.
  if (opts.applicationId) {
    h.set('application_id', opts.applicationId); // mero-js >=7 parseAuthCallback
    h.set('app-id', opts.applicationId); // calimero-client / mero-js 2.x
  }
  if (opts.contextId) h.set('context_id', opts.contextId);
  if (opts.executorPublicKey)
    h.set('executor_public_key', opts.executorPublicKey);
  if (opts.devMode) h.set('dev_mode', '1');

  const u = new URL(frontendUrl);
  u.searchParams.set('_cb', String(Date.now())); // cache-bust, same as desktop
  tab.location.replace(`${u.toString()}#${h.toString()}`);
}
```

Verified facts behind this:

- Hash param names come from `mero-js/src/auth/index.ts:31-40`: `access_token`, `refresh_token`, `application_id`, `context_id`, `context_identity`, `node_url`. The desktop sends `app-id` (older contract) — **send both keys**, they're harmless to an app that ignores one.
- mero-react validates the hash's `node_url` against the node login was initiated with before storing anything (`MeroContext.tsx:212`). Since we always send our own origin, this passes.

**Gotchas to encode in the implementation:**

- **Popup blocker.** The desktop does `await apiClient.node.listApplications()` _before_ opening, to warm the token (`InstalledApps.tsx:140`). Awaiting before `window.open` in a browser loses the user-gesture and the tab is blocked. Open `about:blank` first, then `tab.location.replace(...)`.
- **Mixed content.** A node served over `https://` opening an `http://` app frontend is blocked by the browser. Detect and show a clear error rather than a silently dead tab.
- **`noopener`.** Required — otherwise the app tab gets `window.opener` into the admin origin.
- **Token expiry.** With no refresh token the app tab is good for one access-token lifetime, then falls back to its own login against the node. Acceptable and expected; do not try to be clever.
- **No launchers.** `create_desktop_shortcut` / "Create launcher" has no web equivalent — drop it from the row menu and the context menu.
- **Stable window reuse.** `window.open(url, name)` with a stable name (`app-<appId>`) _does_ reuse a tab, but only if that tab is same-origin-navigable; across origins it still refocuses. Worth using the name for parity with desktop's focus behaviour.

**Call sites to wire up:** Home "Your Applications" cards, Applications row "Open" button, Applications row overflow menu, Applications right-click menu, and (optionally) a per-context "Open in app" in Namespaces using `context_id` + `executor_public_key`.

### 5.2 Nodes tab → single-node, read-only

**Remove** (all of it is Tauri process control — `utils/merod.ts` is 100% `invoke()`):

- Create New Node (data dir picker, node name, admin user/password → `init_merod_node`)
- Node selector dropdown with running/stopped dots
- Server port / swarm port inputs and the auto-port-bump logic
- Start Node / Stop Node / Refresh
- Bundled merod binary version (`get_merod_binary_version`)
- View Logs (§5.3)
- `NodeStatusIndicator`'s multi-node dropdown (`showDropdown` when `runningNodes.length > 1`)
- `App.tsx`'s `handleSelectNode`, `detectRunningMerodNodes`, auto-start-merod, auto-nodeUrl-adoption
- Home's "Restart Node" button
- **`ConnectPage`** — the dashboard is served by the node, so asking for a URL is wrong. Derive it:

```ts
// src/utils/nodeUrl.ts — the node URL is where we are served from.
export function getNodeUrl(): string {
  const { origin, pathname } = window.location;
  // Respect NODE_PATH_PREFIX: core serves us at {prefix}/admin-dashboard/
  // (core/crates/server/src/admin/service.rs:487).
  const i = pathname.indexOf('/admin-dashboard');
  const prefix = i > 0 ? pathname.slice(0, i) : '';
  return `${origin}${prefix}`;
}
```

Keep `ConnectPage` behind a dev-only escape hatch (`?nodeUrl=` / `VITE_NODE_URL`) so `pnpm dev` on :5173 against a node on :2528 still works.

**Replace with a read-only "Node" page.** All four endpoints exist and are already `protected_routes` in `core/crates/server/src/admin/service.rs`:

| Panel               | Endpoint                        | Notes                                                                                                                                                                                                          |
| ------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Health + version    | `GET /admin-api/health`         | already used by `Dashboard`/`ConnectPage`                                                                                                                                                                      |
| Peer count          | `GET /admin-api/peers`          | `{ count }` — `service.rs:172`                                                                                                                                                                                 |
| Network status      | `GET /admin-api/network/status` | `localPeerId`, `listenAddrs`, `externalAddrs`, `relays[]`, `rendezvous[]`, `autonat[]`, `directUpgrades[]`, all RFC3339 timestamps (`handlers/network/status.rs`) — **richer than anything the desktop shows** |
| Per-namespace usage | `GET /admin-api/usage`          | context/member/subgroup counts + on-disk bytes split by state / private_state / delta / governance (`handlers/usage.rs`)                                                                                       |
| Connection info     | local                           | node URL (read-only), admin-api base, dashboard version                                                                                                                                                        |

`calimero-client` only wraps `health` of these four; `peers` / `network/status` / `usage` need raw `fetch` — the same pattern `src/api/namespaceApi.ts` already uses. (`mero-js` 7.x _does_ wrap all three at `admin-client.ts:1043-1053` — an argument for D1 Option B.)

Gate the page behind Developer Mode, matching how desktop gates its Nodes tab.

### 5.3 Logs — verdict: not possible over HTTP

**Evidence, both sides:**

1. **Core exposes no logs route.** The complete admin router is `core/crates/server/src/admin/service.rs:91-310`. There is no `/logs`, no `/admin/logs`, no log streaming, no SSE log channel. A repo-wide grep for `"/logs"` / `route("/log` across `core/crates/**/*.rs` returns nothing (the only near-hit is `/login` in `crates/auth/src/api/routes.rs:83`).
2. **Tauri isn't reading the node's logs — it's reading its own file.** `start_merod` spawns merod as a child process and pipes stdout/stderr into `<data_dir>/<node_name>/logs/merod.log` with rotation (`src-tauri/src/log_rotation.rs`). `get_merod_logs` (`src-tauri/src/main.rs:3728`) is a bounded reverse-tail of that directory and explicitly errors _"Logs are only available for nodes started by the app"_ when the dir is absent. `clear_merod_logs` truncates it. Pure local filesystem, no network path.
3. **The existing `admin-dashboard/src/pages/Logs.tsx` already discovered this.** It probes `/admin/logs`, `/logs`, `/admin/status` in a loop and, on failure, renders _"No logs endpoint available on this node. Logs are typically only accessible through the Calimero Desktop application."_ That page is **not routed** — it was written, found unworkable, and shelved.

**Options:**

|       | Option                                                                                                                                                                                                                                                                                                | Cost                                                                                                                                                                                                                                                                                                                     | Verdict                                                   |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| **A** | Delete `pages/Logs.tsx` + `Logs.css`. No Logs anywhere in the web dashboard. Node page links to `docs`/desktop for log access.                                                                                                                                                                        | ~0                                                                                                                                                                                                                                                                                                                       | **Recommended for this milestone.** Honest, ships now.    |
| **B** | Add `GET /admin-api/logs?lines=N` to core (tail of merod's own `tracing` file appender) + `GET /admin-api/logs/stream` (SSE). Then port `LogsViewer` verbatim — it's already a self-contained modal with filter / level select / case-sensitivity / auto-scroll / ANSI rendering / 3000-line DOM cap. | core PR + rc cut + `admin-dashboard-build.zip` rebuild. merod currently logs to stdout; a file appender + a read handler must be added. **Security-sensitive** (logs leak peer IDs, token errors, paths) — must be admin-scoped, and note `/jsonrpc,/ws,/sse` still have no scope mappings per the known auth scope gap. | Best long-term. Separate, scoped piece of work.           |
| **C** | Client-side "activity log": subscribe to the node's existing WS/SSE event stream and render node _events_ (context created, app installed, membership change) in a `LogsViewer`-shaped panel, clearly labelled **Activity**, not Logs.                                                                | medium, no core change                                                                                                                                                                                                                                                                                                   | Good middle ground if a log-shaped surface is wanted now. |

**Recommendation:** ship **A** now; file **B** as a core issue (it is the only real fix); consider **C** only if a log-shaped panel is explicitly wanted.

### 5.4 Onboarding — mostly not portable

Desktop steps (`Onboarding.tsx:33`): `welcome` → `what-is` → `node-setup` → `cloud-connect` → `login` → `install-app`.

- `node-setup` — creates/starts an embedded merod, picks data dir + ports. **Not portable.** By the time the web dashboard loads, the node exists and is running (it is serving the page).
- `cloud-connect` — see §5.5.
- `welcome`, `what-is`, `login`, `install-app` — portable, and worth it: a first-run "Welcome → what Calimero is → sign in → install your first app" flow is a genuine improvement over the current bare `LoginPage`.

Port the 4 portable steps as an optional first-run wizard keyed on a `onboardingCompleted` flag in localStorage. Reuse `Onboarding.css` (1756 lines) for the step chrome + progress bar. Known gotcha from the desktop's own history: the progress bar flickered because nested components remounted — render the progress steps as JSX values, not as a nested component.

### 5.5 Cloud / High Availability — Phase 5, optional

`utils/cloudApi.ts` (791 lines, HA enable/disable, TEE admission policy, cloud namespaces) has **zero** `invoke()` calls and is portable as-is. `utils/cloudAuth.ts` (385 lines) has 3 — it runs a loopback OAuth flow through Tauri. A web build needs a normal redirect OAuth against `cloud.calimero.network`, plus `utils/teeEviction.ts` (494 lines) and the Namespaces HA panel.

Keep behind the same `isCloudEnabled()` flag (`utils/featureFlags.ts` is portable verbatim) and default it **off** for the web build. Do not attempt in Phases 1-4.

---

## 6. Real bugs / blockers found in `admin-dashboard` today

### 6.1 Installed-app metadata is parsed with the wrong schema — **blocks §5.1**

`src/utils/metadata.ts:7` → `parseAppMetadata` returns the legacy `AppMetadata` shape declared at `src/pages/InstallApplication.tsx:20`:

```ts
{
  applicationUrl,
    applicationName,
    applicationOwner,
    applicationVersion,
    description,
    contractAppId,
    repositoryUrl;
}
```

The metadata the node actually stores for a bundle install is produced by `BundleManifest::to_metadata_json` (`core/crates/bundle/src/lib.rs:249-304`):

```json
{ "package": "...", "version": "...", "name": "...", "description": "...", "author": "...",
  "icon": "...", "tags": [...], "license": "...",
  "links": { "frontend": "...", "github": "...", "docs": "..." } }
```

So today `Applications.tsx` reads `meta?.applicationName` → `undefined` → every bundle-installed app renders with **no name and no version**, falling back to the raw app id. And `links.frontend` — the URL §5.1 needs — is never read.

**Fix:** replace `parseAppMetadata` with desktop's `decodeMetadata` (`appUtils.ts:27`), which handles base64 strings, `number[]`, and already-decoded objects, and decodes UTF-8 properly (a `Latin-1 atob` mangles em-dashes in descriptions). Read `name` / `version` / `description` / `links.frontend` / `icon`. Confirmed real: `mero-blocks/logic/Cargo.toml` sets `frontend = "https://mero-blocks.vercel.app/"` under `[package.metadata.calimero]`, and `to_metadata_json` nests it under `links`.

### 6.2 Sidebar logo is hardcoded and light-mode-hostile

`components/Navigation.tsx:56-112` inlines a ~50-line path SVG with `fill="#fafafa"` on every path. On a light theme the wordmark disappears. `src/assets/calimero-logo.svg` already exists — use it as an `<img>` with desktop's `filter: brightness(0) invert(1)` / `[data-theme="light"] { filter: brightness(0) }` (`Sidebar.css:30-40`).

### 6.3 Four independent copies of toast state

`NewMarketplace.tsx:71`, `Applications.tsx:56`, `Namespaces.tsx:50`, `Contexts.tsx` each hold `useState<{msg,type}>` + `setTimeout(3500)` + an `.alert` div. Replaced wholesale by `ToastContext` + `ToastContainer`.

### 6.4 Duplicated install logic

The v1-`artifact` / v2-`artifacts[]` / mpk-vs-wasm / bs58-hash install logic exists twice: `admin/NewMarketplace.tsx:137-217` and `desktop/Marketplace.tsx:331-419`. They have already diverged (admin has the by-convention URL fallback; desktop has the version picker). Extract one shared `installFromRegistry()` helper in the admin port.

### 6.5 Google Fonts `@import` in a node-served asset

`styles/index.css:1` fetches DM Sans / Inter / JetBrains Mono from `fonts.googleapis.com` at runtime. The dashboard is served from the node, often on a LAN or air-gapped host. Self-host or drop.

### 6.6 Dead weight

~9 unrouted pages and 3 unused component trees (§1.2), plus `@near-wallet-selector/*` (11 packages), `@metamask/sdk-react-ui`, `starknet`, `get-starknet-core`, `near-api-js`, `@dfinity/identity`, `bootstrap`, `react-bootstrap`, `styled-components`, `@libp2p/*`. Some are genuinely used by the Identity root-key providers — audit before removing. `bootstrap`/`react-bootstrap`/`styled-components` are the safe first cuts.

### 6.7 `NewMarketplace` reads `VITE_SERVER_URL` for the registry

`NewMarketplace.tsx:12` — the env var is named for a _server_, defaults to `https://apps.calimero.network`, and there's no UI to change it. Superseded by the ported multi-registry Settings.

---

## 7. Phased implementation plan

### Phase 0 — Cleanup (no visual change)

1. Delete unrouted pages/components: `AddRelease`, `JoinContext`, `StartContext`, `ApplicationDetails`, `components/publishApplication/*`, `components/applications/*` legacy row/table files, `components/context/{startContext,joinContext,contextDetails}/*`, `components/layout/*`, `components/footer/*`, `hooks/useNear.tsx`, `utils/wallet.ts`, `utils/starknetWalletType.ts`. Extract the still-needed `AppMetadata`-adjacent types into `src/types/` first.
2. Delete `pages/Logs.tsx` + `pages/Logs.css` (§5.3 Option A).
3. Delete `pages/InstallApplication.tsx` + `pages/PublishApplication.tsx` after moving their types out.
4. Drop `bootstrap`, `react-bootstrap`, `styled-components` from `package.json`.
5. Keep `pnpm test` + `pnpm lint` green.

### Phase 1 — Design system + shell

6. Port desktop `index.css` tokens into `styles/index.css`, including the whole `[data-theme="light"]` block and `--desktop-space-background`. Resolve the name collisions in §2.1 by **adding** desktop's names and aliasing admin's old ones (`--radius: var(--radius-md)`), so no existing page breaks.
7. Add `contexts/ThemeContext.tsx` (key `calimero-admin-theme`, default dark) and set `data-theme` on `<html>`; wrap in `main.tsx`.
8. Add `contexts/ToastContext.tsx` + `components/ToastContainer.tsx/.css`; wrap in `main.tsx`.
9. Port desktop's `.button*` system into `styles/index.css`, keeping `.btn*` as aliases.
10. Port `Skeleton`, `DataTable`, `ContextMenu`, `ScrollHint`, `ErrorBoundary` + their CSS.
11. Build `components/AppShell.tsx`: `.app` → `.app-layout` → `Sidebar` + `.app-content` → `.header` (title + version badge + `NodeStatusIndicator`) + `.main`. Convert every page from `<div className="app-shell"><Navigation/>…` to a plain content component rendered inside the shell (routes wrap in `AppShell`).
12. Rewrite `Sidebar` from `Navigation.tsx`: 240px, `<img>` logo (§6.2), left accent bar, icon hover scale, `<Link>` items, Settings + Logout in the footer.
13. Strip the multi-node dropdown from `NodeStatusIndicator`; wire a 10s health poll in `AppShell`.

Nav order (Namespaces / Contexts / Node gated on Developer Mode, mirroring desktop):
`Home` · `Node`_ · `Namespaces`_ · `Contexts`\* · `Applications` · `Marketplace` · `Blobs` · `Identity` — footer: `Settings`, `Logout`.

### Phase 2 — Open apps in new tabs (highest value)

14. Add `utils/nodeUrl.ts` (§5.2) and `utils/appUtils.ts` (`decodeMetadata`, `kebabCase`, `appendParamsToUrl`, `parseApiError`).
15. Fix metadata parsing everywhere (§6.1); delete `utils/metadata.ts`.
16. Add `utils/openApp.ts` (§5.1) with the popup-blocker-safe two-step open, `noopener`, mixed-content detection, both `application_id` and `app-id`, and **no** `refresh_token`.
17. Rebuild `pages/Applications.tsx` on `DataTable`: Name (+ID) / Version / Size / Description / Actions, sortable, **Open** button, overflow menu (Copy ID, Uninstall — no "Create launcher"), right-click `ContextMenu`, skeleton table. Keep admin's "used by N contexts" uninstall guard.
18. Add `pages/ConfirmAction.tsx` + `.css`; route uninstall through it with breadcrumbs.
19. Add the Home "Your Applications" grid (first 4, click-to-open, "Open" hover hint) + empty-state card.

### Phase 3 — Marketplace + Settings

20. Port `utils/registry.ts` and `utils/marketplaceCache.ts` verbatim.
21. Port `utils/settings.ts` minus every `embeddedNode*` field; storage key `calimero-admin-settings`. Fields: `registries[]`, `developerMode`, `cloudEnabled?`, `onboardingCompleted`.
22. Add `pages/Settings.tsx` + `.css` with tabs **General** (Dark Mode, Developer Mode, Clear local state) · **Registries** (add/remove, autosave) · **About** (dashboard version, merod version from `/health`, node URL). Reuse desktop's toggle-switch and card markup.
23. Rewrite `NewMarketplace.tsx` → `Marketplace.tsx`: multi-registry, cache + stale-while-revalidate, filter pills, clear-search, detail modal, version picker, "Explore Registry on web" (`window.open`), matching skeleton cards. Extract the shared `installFromRegistry()` (§6.4) and keep admin's by-convention URL fallback.

### Phase 4 — Node page, Namespaces parity, first-run

24. Add `pages/Node.tsx` (§5.2) — health/version, peer count, network status, per-namespace usage, connection info. Dev-mode gated.
25. Delete `ConnectPage` from the normal flow; keep a dev-only override. Simplify `AuthWrapper` to `loading | needs-login | authenticated`.
26. Namespaces parity: stat cards + tooltips, collapsible tree view, per-row actions dropdown, Create Context + Join Context modals, `parseApiError`, role colours. Keep admin's `setSubgroupVisibility` control.
27. Restyle `Contexts`, `Blobs`, `Identity` onto the new tokens/components (`DataTable` where they currently hand-roll lists).
28. Optional: port the 4 portable onboarding steps (§5.4).

### Phase 5 — Optional / deferred

29. Cloud + HA (§5.5) — needs a web OAuth flow first.
30. AI-agent key minting, clipboard-only (no file write).
31. Core `GET /admin-api/logs` (§5.3 Option B) → then port `LogsViewer` verbatim.

---

## 8. Decisions needed before Phase 1

- **D1 — SDK.** Keep `@calimero-network/calimero-client` (recommended: it already covers node/auth/admin/blob + full group management, and Phases 1-4 are UI work), or migrate to `mero-js` 7 + `mero-react` 4 for literal code parity with desktop? Migrating gets the namespace hooks, a login modal, and wrappers for `peers`/`network/status`/`usage` for free, at the cost of rewriting the auth flow and every page's data layer. Note the desktop itself is pinned to the older `mero-js@2.2.1` / `mero-react@2.4.0` while the repos sit at 7.3.2 / 4.6.1 — a literal port would inherit a stale pin.
- **D2 — Icons.** Adopt `lucide-react` (desktop's, so component ports are copy-paste and glyphs match exactly) or keep `@heroicons/react` and re-map every icon? Recommend lucide, and delete heroicons once no page references it.
- **D3 — Fonts.** Desktop's system/Inter stack (no network request, recommended) or self-hosted DM Sans?
- **D4 — Login UX.** Keep admin's redirect-to-auth-frontend (`apiClient.auth().login()`, `AuthWrapper.tsx:100`) or port desktop's in-app `LoginView` + `ProviderSelector` + `UsernamePasswordForm`? The in-app form is closer to "same design"; the redirect is fewer moving parts and already handles every provider.
- **D5 — Logs.** Confirm §5.3 Option A for this milestone, and whether to open the core issue for Option B.
- **D6 — Developer Mode gating.** Desktop hides Namespaces/Nodes unless Developer Mode is on. Should the _admin_ dashboard hide them too, or is an admin tool always "developer mode"? Recommend: show Namespaces + Contexts always (they're the point of an admin tool), gate only the Node diagnostics page.

---

## 9. Testing

- **Existing:** `src/test/namespaceApi.test.ts` + vitest/jsdom. Desktop has 11 unit suites and 9 Playwright e2e specs (`e2e/{navigation,nodes,smoke,auth,settings,namespaces,node-lifecycle,marketplace,error-boundary}.spec.ts`).
- **Add unit tests** for: `openApp` hash construction (asserting **no** `refresh_token` and both id keys present), `decodeMetadata` against a real `to_metadata_json` payload, `getNodeUrl` with and without `NODE_PATH_PREFIX`, settings migration, `marketplaceCache` staleness.
- **Add Playwright** mirroring the desktop specs minus `nodes`/`node-lifecycle`: `smoke`, `navigation`, `auth`, `applications` (incl. open-in-new-tab via `context.waitForEvent('page')`), `marketplace`, `settings`, `namespaces`, `error-boundary`.
- **CI:** admin-dashboard's release pipeline builds `admin-dashboard-build.zip`, which core's `build.rs` bakes into merod. Confirm the zip still builds and that nothing in the port depends on a runtime origin the node can't serve (see §6.5).
- **Manual check:** `pnpm build && pnpm preview`, then load through a real node at `<nodeUrl>/admin-dashboard/` — not just `pnpm dev` on :5173 — because the `base: '/admin-dashboard/'` + `NODE_PATH_PREFIX` HTML rewriting (`core/crates/server/src/admin/service.rs:514-528`) only exercises on the real path.

---

## 10. Explicitly out of scope

Multi-node create/start/stop, embedded merod, bundled binary version/download, data-directory picker, debug-log flags, total nuke, start-at-login, Tauri auto-updater + `UpdateNotification`, desktop shortcuts / "Create launcher", per-app native launchers, `calimero://` deep links (`useAppDeepLink`), the token broker, tray icon, and node log file access. All of these depend on a local process or filesystem the browser cannot reach.
