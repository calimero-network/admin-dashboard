# Calimero Admin Dashboard

A modern React-based admin dashboard for the Calimero Network, built with TypeScript and Vite.

## 🚀 Features

- Modern React 18 with TypeScript
- Vite for fast development and building
- NEAR Wallet integration
- Multi-wallet support (MetaMask, StarkNet, etc.)
- Responsive design with Bootstrap
- Automated semantic releases

## 📦 Installation

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview
```

## 🔧 Development

### Prerequisites

- Node.js 20+
- pnpm 8+

### Available Scripts

- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm preview` - Preview production build
- `pnpm lint` - Run ESLint
- `pnpm lint:fix` - Fix ESLint issues
- `pnpm prettier` - Format code with Prettier
- `pnpm prettier:check` - Check code formatting

## 🚀 Release Process

This project uses **semantic releases** with automated versioning and deployment.

### How It Works

1. **Conventional Commits**: All commits must follow the [Conventional Commits](https://www.conventionalcommits.org/) specification
2. **Automated Versioning**: Semantic-release automatically determines the next version based on commit messages
3. **Release Creation**: Creates GitHub releases with changelog and zip files
4. **Deployment**: Automatically deploys to GitHub Pages

### Commit Message Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

**Types:**
- `feat`: New features (triggers minor version bump)
- `fix`: Bug fixes (triggers patch version bump)
- `BREAKING CHANGE`: Breaking changes (triggers major version bump)
- `docs`: Documentation changes
- `style`: Code style changes
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Maintenance tasks

**Examples:**
```bash
git commit -m "feat: add new wallet integration"
git commit -m "fix: resolve authentication issue"
git commit -m "feat(ui): add dark mode support

This adds a new dark mode toggle in the settings panel."
git commit -m "BREAKING CHANGE: remove deprecated API endpoints"
```

### Release Workflow

1. **Push to main branch** triggers the release workflow
2. **Tests run** to ensure code quality
3. **Semantic-release analyzes** commit messages
4. **If new version needed**:
   - Creates GitHub release
   - Generates changelog
   - Creates zip file with build
   - Deploys to GitHub Pages
5. **If no new version needed**: Only deploys to GitHub Pages

### Release Assets

Each release includes:
- **Source code** (zip file)
- **Built application** (zip file)
- **Changelog** (automatically generated)
- **Release notes** (from commit messages)

## 🏗️ CI/CD Pipeline

The project uses GitHub Actions with the following workflows:

### Release Workflow (`.github/workflows/release.yml`)

- **Triggers**: Push to main branch
- **Jobs**:
  1. **Test**: Runs linting and formatting checks
  2. **Release**: Creates semantic release with zip files
  3. **Deploy**: Deploys to GitHub Pages

### Features

- ✅ Automated semantic versioning
- ✅ Conventional commit validation
- ✅ Automated changelog generation
- ✅ Zip file creation for releases
- ✅ GitHub Pages deployment
- ✅ Concurrent run prevention
- ✅ Build caching for faster runs

## 📁 Project Structure

```
src/
├── components/          # React components
│   ├── applications/    # Application management
│   ├── common/         # Shared components
│   ├── context/        # Context management
│   └── ...
├── pages/              # Page components
├── hooks/              # Custom React hooks
├── utils/              # Utility functions
├── types/              # TypeScript type definitions
├── constants/          # Application constants
└── styles/             # Global styles
```

## 🔐 Environment Variables

Create a `.env` file in the root directory:

```env
# Add your environment variables here
VITE_API_URL=your_api_url
VITE_NEAR_NETWORK_ID=testnet
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes following conventional commits
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Commit Guidelines

- Use conventional commit format
- Write clear, descriptive commit messages
- Reference issues when applicable
- Keep commits atomic and focused

## 📄 License

This project is licensed under the MIT License.

## 🔗 Links

- [Live Demo](https://calimero-network.github.io/admin-dashboard/)
- [GitHub Repository](https://github.com/calimero-network/admin-dashboard)
- [Calimero Network](https://calimero.network/) 