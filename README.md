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

This project uses semantic releases. When you merge to `main`, it automatically:

1. Runs tests and linting
2. Analyzes commit messages for version bumps
3. Creates GitHub release with changelog
4. Builds and zips the app
5. Deploys to GitHub Pages

### Commit Messages

Use conventional commits to trigger releases:

- `feat: new feature` → minor version bump
- `fix: bug fix` → patch version bump
- `BREAKING CHANGE: description` → major version bump

### Release Workflow

1. Create a feature branch:

```bash
git checkout -b feature/your-feature
git add .
git commit -m "feat: your feature description"
git push origin feature/your-feature
```

2. Create a Pull Request to main

3. Merge the PR - this triggers the release automatically

The GitHub Action will handle versioning and deployment.
