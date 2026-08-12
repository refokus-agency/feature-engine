# Contributing to @refokus-agency/feature-engine

Thanks for your interest in improving this package. This guide covers everything
you need to get a change from your machine into `main`.

For AI-agent-facing conventions — architecture, naming, import order, test
patterns — see [AGENTS.md](AGENTS.md). This guide is the human-facing companion
and stays task-oriented.

## How to Contribute

1. **Fork** the repository to your own account.
2. **Branch from `main`** using the repository convention
   `<type>/<issue-number>-<slug>`, for example
   `feat/23-parallel-feature-initialization` or `docs/30-community-files`. Use
   the same type prefixes as commits (see
   [Commit Conventions](#commit-conventions)).
3. **Make your change**, with tests when the change touches behavior.
4. **Open a pull request against `main`**.

Every change should trace back to an issue. If one does not exist yet, open it
first — see [Submitting Issues](#submitting-issues).

## Development Setup

**Requirements**

- **Node.js >= 24.0.0** (`engines.node`). `.nvmrc` pins `v24.14.0` — run
  `nvm use` to match it. CI runs on Node 24 as well, so local and CI agree.
- **npm** — the canonical package manager. `package-lock.json` is the committed
  lockfile. Do not substitute another package manager: it will not read this
  lockfile and may produce a different dependency tree.

The package is **ESM-only** (`"type": "module"`) and ships no runtime
dependencies.

**Commands**

```bash
npm install            # install dependencies
npm test               # run the test suite once (Vitest)
npm run test:watch     # run tests in watch mode
npm run test:coverage  # run tests with a coverage report
npm run test:ui        # run tests in the Vitest UI
npm run typecheck      # TypeScript type check, no emit
npm run lint           # ESLint, WRITES fixes to ./src
npm run lint:report    # ESLint, read-only — use this to verify
npm run format         # Prettier, writes to ./src
npm run build          # compile TypeScript to ./dist
npm run build:clean    # remove dist and rebuild
npm run build:watch    # compile in watch mode
npm run bench          # run the Vitest benchmarks
npm run commit         # Conventional Commit wizard
```

`npm run lint` carries `--fix` and `npm run format` carries `--write`; both
modify your files. When you only want to *check* whether linting passes, use
`npm run lint:report` — it reports without mutating anything, which is what you
want inside a verification chain.

To run a single test file or pattern:

```bash
npx vitest run src/__tests__/loader.test.ts   # one file
npx vitest run -t "should export"             # by test name
```

## Submitting Issues

Open an issue at
**[/issues/new/choose](https://github.com/refokus-agency/feature-engine/issues/new/choose)**.
Bug reports are most useful with a minimal reproduction; feature requests are
most useful with the problem stated before the proposed solution.

One thing does **not** belong in an issue: **security vulnerabilities**. Report
those privately via
[a security advisory](https://github.com/refokus-agency/feature-engine/security/advisories/new).
Never disclose a vulnerability in a public issue. See [SECURITY.md](SECURITY.md)
for the full policy.

## Submitting Pull Requests

Before you open the PR, run the full verification chain locally:

```bash
npm run lint:report && npm run typecheck && npm test && npm run build
```

Then:

1. **Link the issue** your change resolves.
2. **Keep the PR focused.** One logical change per pull request — it reviews
   faster and reverts cleanly.
3. **Update the docs** when behavior changes. `README.md` documents the public
   API; `AGENTS.md` documents conventions.

**Continuous integration.** The `Pull Request` workflow runs on every pull
request and delegates to the shared Refokus platform pipeline. Your PR must be
green before review — treat a red check as a change that is not ready, not as a
technicality.

One thing about that pipeline is worth knowing: **CI runs `npm run lint`, which
auto-fixes.** Lint problems that ESLint can repair on its own are silently
repaired in the CI workspace and never reported, so a green lint check is weaker
than it looks. Run `npm run lint:report` locally for the read-only verdict.

The type-check script is named `typecheck` for a reason worth knowing before you
rename it: the shared pipeline probes for that exact name and silently skips the
step when it is missing — no failure, just an absent check.

If your PR shows no `Pull Request` check at all, your branch predates the
workflow — rebase onto `main`.

## Code Style

**[ESLint](https://eslint.org/)** handles linting and
**[Prettier](https://prettier.io/)** handles formatting. The configuration lives
in [`eslint.config.js`](eslint.config.js) and
[`.prettierrc.json`](.prettierrc.json) and is the single source of truth — run
`npm run format` rather than matching the rules by hand.

The essentials:

- 2-space indentation, no tabs
- Single quotes
- Semicolons always
- Trailing commas everywhere
- Prettier defaults for everything else, including its 80-character print width

TypeScript runs in strict mode via `@total-typescript/tsconfig`. `eslint-config-prettier`
is applied last, so ESLint never fights Prettier over formatting.

One gotcha catches most first contributions: **relative imports must carry an
explicit `.ts` extension** (`from './types.ts'`). This is not a style preference
— `tsconfig.json` sets `rewriteRelativeImportExtensions: true`, so the compiler
rewrites those specifiers on emit and an extensionless import will not resolve
in the published ESM output.

See the Conventions section of [AGENTS.md](AGENTS.md) for the rest.

## Commit Conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/).
The commit type is not cosmetic: it drives the released version number (see
[Releases](#releases)).

Run the wizard and it will build the message for you — it is Commitizen with the
`cz-conventional-changelog` adapter, configured in `.cz.json`:

```bash
npm run commit
```

These are the types the wizard offers, and the only ones it accepts:

| Type       | Use for                                        |
| ---------- | ---------------------------------------------- |
| `feat`     | a new feature                                  |
| `fix`      | a bug fix                                      |
| `docs`     | documentation only                             |
| `style`    | formatting, no behavior change                 |
| `refactor` | restructuring, no behavior change              |
| `perf`     | a change that improves performance             |
| `test`     | adding or fixing tests                         |
| `build`    | build system or dependencies                   |
| `ci`       | CI configuration and scripts                   |
| `chore`    | tooling, dependencies, repository housekeeping |
| `revert`   | reverts a previous commit                      |

Examples:

```
feat(loader): promote features into later dependency waves
fix(vite): skip feature files with non-literal metadata
docs(readme): document the onSetup abort return value
```

**These conventions are not machine-enforced.** There is no commit-msg hook and
no commitlint step, so a malformed commit will be accepted by Git without
complaint — and then silently produce the wrong version bump, or none at all.
Review is the only thing that catches it. Please use `npm run commit`.

## Releases

Releases are fully automated by
[semantic-release](https://semantic-release.gitbook.io/) when a change merges to
`main`. `@semantic-release/commit-analyzer` reads the commit types in the merge
and derives the next version from them. The configuration lives in
`.releaserc.json`.

Three rules follow from that, and all three matter:

- **Never bump the version in `package.json` manually.** It is deliberately
  pinned to `0.0.0-development` and stays that way in Git — there is no
  `@semantic-release/git` plugin, so nothing commits the bump back.
  `@semantic-release/npm` rewrites the version in the workspace at publish time
  only, so the tarball carries the computed version while the committed manifest
  never changes. Editing it does not change what gets published; it just creates
  a confusing diff.
- **Never publish by hand.** No `npm publish`. Publishing is the release
  pipeline's job, and running it locally can ship an unreviewed build.
- **Do not add a changelog file.** This repository does not track a
  `CHANGELOG.md`. `@semantic-release/release-notes-generator` writes the notes
  for each version straight into the
  [GitHub Release](https://github.com/refokus-agency/feature-engine/releases)
  body, which is the only changelog there is.

Write a good commit type and the version takes care of itself.

## Response Time

We aim to respond to new issues and pull requests within **5 business days**.
This is an open-source package maintained alongside client work, so review may
take longer during busy periods — a follow-up comment after a week of silence
is welcome, not a nuisance.

Security reports follow the timeline in [SECURITY.md](SECURITY.md).

## Code of Conduct

This project adheres to the [Contributor Covenant](CODE_OF_CONDUCT.md). By
participating, you are expected to uphold it. Report unacceptable behavior to
packages@refokus.com.

## License

Contributions are made under the same license as the project: the Apache License
2.0 (**`Apache-2.0`**), matching the `license` field in `package.json`. See
[LICENSE](LICENSE) for the full text and [NOTICE](NOTICE) for the attribution
notice that ships with every release.
