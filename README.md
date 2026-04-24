# @refokus-agency/typescript-package-tmp

A TypeScript package template for Refokus Agency focused on Webflow CMS sync tools.

## Features

- 🔧 Modern TypeScript configuration with strict mode
- 📦 ES Module support with CommonJS compatibility
- 🧪 Testing setup with Vitest
- 🎨 Code formatting with Prettier
- 🔍 Linting with ESLint (flat config)
- 🏗️ Build pipeline with TypeScript compiler
- 📝 Source maps for debugging

## Requirements

- Node.js >= 22.0.0

> [!WARNING]

This package is not meant to be published or installed. You need to copy this template and setup properly first


## Installation

```bash
npm install @refokus-agency/typescript-package-tmp
```

## Usage

```typescript
import { exampleFunction } from '@refokus-agency/typescript-package-tmp';

exampleFunction(); // Outputs: Hello World
```

## Development

### Available Scripts

#### Building
```bash
npm run build          # Compile TypeScript
npm run build:clean    # Clean and rebuild
npm run build:watch    # Watch mode
```

#### Testing
```bash
npm test               # Run tests
npm run test:watch     # Watch mode
npm run test:coverage  # With coverage
npm run test:ui        # With UI
```

#### Code Quality
```bash
npm run check-types    # Type checking
npm run lint           # Lint and fix
npm run format         # Format code
```

## Project Structure

```
src/
├── index.ts           # Main entry point
└── example/
    └── index.ts       # Example implementations
```

## Publishing

This package uses automated semantic versioning and publishing through GitHub Actions. The release process is triggered automatically on pushes to the `main` branch or manually through GitHub Actions.

### Release Process

The publishing workflow (`workflows/release-package-version.yml`) handles the following:

1. **Automatic Triggering**: Releases check are triggered on:
   - Push to `main` branch

2. **Environment**: Runs in the `Production` Github repository environment with required permissions
    - Accesess `GH_PAT_TOKEN` secret inside `Production` environment
        - Its value should be a [PAT](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) with the following access
            - **repo**: all
            - **packages**: all

### Semantic Versioning

> **⚠️ WARNING:**
> This repository uses automated semantic versioning and publishing.
> **Do not publish manually with `npm publish`.**
> All releases are handled by GitHub Actions via semantic-release.
>  
> To trigger a release, push to the `main` branch or use the GitHub Actions workflow manually.
>  
> Ensure your commits follow [Conventional Commits](https://www.conventionalcommits.org/) to enable correct versioning and changelog generation.
> In order to do that, you MUST run use `npm run commit` to run the commitizen wizzard and be compliant with our versioning standards

The project uses [semantic-release](https://semantic-release.gitbook.io/) for automated version management based on conventional commits:

- **Major version** (`x.0.0`): Breaking changes (commits with `BREAKING CHANGE:` or `!:`)
- **Minor version** (`0.x.0`): New features (commits with `feat:`)
- **Patch version** (`0.0.x`): Bug fixes (commits with `fix:`)



### Commit Message Format

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```bash
# Feature
feat: add new functionality

# Bug fix
fix: resolve issue with feature

# Breaking change
feat!: remove deprecated API
# or
feat: add new API
BREAKING CHANGE: old API has been removed

# Documentation
docs: update README

# Style changes
style: format code

# Refactoring
refactor: restructure code

# Performance
perf: improve performance

# Tests
test: add unit tests
```

### Publishing to GitHub Packages

The package is published to GitHub Packages under the `@refokus-agency` scope. The workflow:

- Uses GitHub Packages registry (`https://npm.pkg.github.com`)
- Publishes under `@refokus-agency` scope
- Requires `GITHUB_TOKEN` and `GH_PAT_TOKEN` secrets

### Manual Release

To trigger a release manually:

1. Go to the GitHub repository
2. Navigate to **Actions** tab
3. Select **Release Package Version** workflow
4. Click **Run workflow**
5. Choose the branch (usually `main`)
6. Click **Run workflow**

### Prerequisites

Before publishing, ensure:

- All tests pass (`npm test`)
- Code is properly formatted (`npm run format`)
- Linting passes (`npm run lint`)
- Type checking passes (`npm run check-types`)
- Commit messages follow conventional commits format

### Release Notes

Semantic-release automatically:
- Generates changelog based on commit messages
- Creates GitHub releases with release notes
- Tags releases in Git
- Updates package version in `package.json`


## License

See [LICENSE](LICENSE) file.
