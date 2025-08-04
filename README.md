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
