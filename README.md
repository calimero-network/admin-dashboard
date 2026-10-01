# Calimero Admin Dashboard

## How to Run

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build
```

## Tests

Three layers, each proving something the one before it cannot.

```bash
pnpm test              # unit (vitest)
pnpm test:e2e          # UI, node mocked with page.route
pnpm test:e2e:live     # ONE real merod
pnpm test:e2e:merobox  # TWO real merods, in Docker
```

- **`test:e2e`** — fast and hermetic. Proves the UI: what renders, what the
  forms send. It assumes the node's request/response shapes, because it is the
  one writing them.
- **`test:e2e:live`** — boots a real `merod` (`pnpm merod:prepare` fetches a
  pinned release), mints a real admin token, and drives the UI against it.
  Proves the wiring the mocks can only assume — request shapes, response
  envelopes, auth headers. It is what catches a field the node does not read,
  or an envelope unwrapped the wrong way, both of which fail silently.
- **`test:e2e:merobox`** — boots two nodes with
  [merobox](https://pypi.org/project/merobox/) (`pip install merobox`, needs
  Docker), the same harness core uses for its own multi-node e2e. Proves the
  one thing a single node cannot: **membership**. An invitation is a claim
  about somebody else's node, so with one node an invite/join test can neither
  fail nor pass. Set `MEROBOX_KEEP=1` to leave the cluster up for poking at.

  This one runs from the **Actions tab** (workflow_dispatch) and nightly, not
  on pull requests — the harness is still being brought up, and a check that
  has never been green does not belong in front of every PR. Move it back into
  `ci.yml` once it has passed a few times.

## Release Process

A release is cut only when the `version` in `package.json` changes on
`master`, or when a `v<version>` tag matching `package.json` is pushed for a
commit on `master`. Other merges do not release.

1. Open a PR that bumps `version` in `package.json` (and `CHANGELOG.md`).
2. Merge it. `.github/workflows/release.yml` runs the checks, builds with
   `DASHBOARD_VERSION=<version>`, and creates release `v<version>` with
   `admin-dashboard-build.zip` and `admin-dashboard-build.zip.sha256`. The
   release notes carry the zip's sha256.
3. An existing release is never replaced: if `v<version>` already exists, the
   workflow publishes nothing. Bump the version instead.
4. Bump core's pin (`crates/server/build.rs`: `CALIMERO_WEBUI_VERSION` and
   `CALIMERO_WEBUI_SHA256`) to the new tag and the sha256 from the release
   notes. To check the zip, rebuild the tag with
   `DASHBOARD_VERSION=<version> pnpm build`.
