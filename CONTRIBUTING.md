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
npm test               # run the test suite once, with the coverage gate (Vitest)
npm run test:watch     # run tests in watch mode (no coverage)
npm run test:coverage  # alias for the same coverage run
npm run test:ui        # run tests in the Vitest UI
npm run typecheck      # TypeScript type check, no emit
npm run lint           # Biome lint, WRITES fixes to ./src
npm run lint:report    # Biome lint, read-only — use this to verify
npm run format         # Biome formatter, writes to ./src
npm run build          # compile TypeScript to ./dist
npm run build:clean    # remove dist and rebuild
npm run build:watch    # compile in watch mode
npm run bench          # run the Vitest benchmarks
npm run commit         # Conventional Commit wizard
```

`npm run lint` and `npm run format` both carry Biome's `--write`; both modify
your files. When you only want to *check* whether linting passes, use
`npm run lint:report` — it reports without mutating anything, which is what you
want inside a verification chain.

To run a single test file or pattern:

```bash
npx vitest run src/__tests__/loader.test.ts   # one file
npx vitest run -t "should export"             # by test name
```

## Test Coverage

`npm test` runs with `--coverage`, so the coverage gate is part of **every** test
invocation — yours and CI's. `npm run test:coverage` is kept as an explicit alias
for the same thing. The configuration lives in
[`vite.config.ts`](vite.config.ts) under `test.coverage`, using the `v8`
provider.

The thresholds are **absolute uncovered counts, not percentages**. A negative
number is read by Vitest as "at most this many uncovered items":

- `statements: -9` — at most 9 uncovered statements
- `branches: -9` — at most 9 uncovered branches
- `lines: -4` — at most 4 uncovered lines
- `functions: 100` — a positive percentage, so every function must be covered.
  It cannot be written as `-0`, because `-0 >= 0` is true in JavaScript and the
  gate would then pass no matter how many functions went uncovered.

These counts are specific to the coverage provider that produced them. Vitest 4
rewrote how the `v8` provider maps raw coverage back to source, so both the
totals and the uncovered counts moved when it landed — the numbers above are not
comparable to the ones the same suite reported under Vitest 3. If a provider or
major Vitest upgrade shifts them again, recalibrate from a real run rather than
nudging the numbers by hand.

Three paths are excluded from measurement: `src/types.ts` (type-only, erased at
runtime, so there is nothing for v8 to instrument), `src/index.ts` (a barrel of
re-exports with no logic of its own), and `src/__tests__/**` (test scaffolding,
not shipped code).

**There is currently zero slack in the gate.** The suite sits at exactly 9
uncovered statements, exactly 9 uncovered branches, exactly 4 uncovered lines,
and 47 of 47 functions covered. The practical consequence: adding a single
uncovered line, or one
untested function, fails the build. When that happens you have two ways out, and
either one belongs in the same pull request as the code that caused it — write
the test that covers the new code, or deliberately adjust the threshold in
`vite.config.ts` and explain why in the PR description. The tightness is
intentional. It is a ratchet, meant to stop coverage from drifting down one
unnoticed line at a time.

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
auto-fixes.** Lint problems that Biome can repair on its own are silently
repaired in the CI workspace and never reported, so a green lint check is weaker
than it looks. Run `npm run lint:report` locally for the read-only verdict — and
read that verdict carefully, because passing is not the same as clean: Biome
exits 0 on warnings, so `lint:report` can succeed while still printing a long
list of them.

The type-check script is named `typecheck` for a reason worth knowing before you
rename it: the shared pipeline probes for that exact name and silently skips the
step when it is missing — no failure, just an absent check.

If your PR shows no `Pull Request` check at all, your branch predates the
workflow — rebase onto `main`.

## Code Style

**[Biome](https://biomejs.dev/)** does both jobs — linting and formatting — from
a single toolchain, at the exact pinned version `2.5.8`. The configuration lives
in [`biome.json`](biome.json) and is the single source of truth — run
`npm run format` rather than matching the rules by hand.

The essentials, all of them set explicitly in `biome.json`:

- 2-space indentation, no tabs
- Single quotes
- Semicolons always
- Trailing commas everywhere
- 80-character lines — that is Biome's configured `lineWidth`, not a default
- LF line endings
- Arrow parameters always parenthesized, bracket spacing on, and object
  properties quoted only where the syntax needs it

TypeScript runs in strict mode via `@total-typescript/tsconfig`. There is no
formatter/linter conflict to reconcile and no compatibility shim to keep in the
right order: Biome's linter and formatter are designed not to fight each other
over formatting.

On the lint side, Biome's `recommended` rule set is on, with `noConsole` and
`useBlockStatements` switched off. Two rules are deliberately set to `warn`
instead of `error` — `noExplicitAny` and `noUnusedVariables` — and since Biome
exits 0 on warnings, neither fails the build. There are 102 warnings today,
mostly `noNonNullAssertion` and `noExplicitAny`. Error-level rules do fail the
build, and one of those is worth calling out because it is genuinely new:
`noDebugger` is now enforced at error severity, so a stray `debugger` statement
breaks lint. The old ESLint config only carried a comment reminding someone to
add that check, which meant it was never actually enforced.

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
