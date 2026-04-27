---
issue_number: 5
issue_title: "Migrate Vite plugin (feature-metadata) to TypeScript"
repo: "refokus-agency/feature-engine"
labels: [enhancement]
plan_level: "standard"
depth: "medium"
branch_name: "feat/5-migrate-vite-plugin-to-typescript"
created_at: "2026-04-27T12:00:00Z"
updated_at: "2026-04-27T18:30:00Z"
---

# Implementation Plan: #5 — Migrate Vite plugin (feature-metadata) to TypeScript

## Source Reference

Production-proven implementation: `toggl-site-custom-code/plugins/feature-metadata.js` (origin/main). This plan is a direct TypeScript migration of that plugin, adapted to feature-engine package conventions.

## Files

| # | Action | Path | Purpose | Status |
|---|--------|------|---------|--------|
| 1 | modify | `src/vite/index.ts` | Replace stub with full plugin (migrate from reference impl) | Done |
| 2 | create | `src/vite/parse-feature-file.ts` | Extract AST parsing functions (parseSource, findDefineFeatureArg, extractMetadata, helpers) | Done |
| 3 | create | `src/__tests__/vite-plugin.test.ts` | Tests for plugin + AST parsing (40 tests) | Done |
| 4 | modify | `package.json` | Move acorn from devDependencies to dependencies (consumers need it at build time) | Done |

## Codebase Context

- **Reference implementation:** `toggl-site-custom-code/plugins/feature-metadata.js` (origin/main) — production-proven, migrated to TypeScript with strict improvements
- `src/types.ts`: `FeatureMeta` interface — virtual module produces this shape (id, selectors, priority, global, dependencies, timeout, load)
- `src/vite/index.ts`: stub existed with `featureMetadataPlugin(): Plugin` signature and `./vite` export path already wired in package.json
- `package.json`: acorn `^8.14.1` moved from devDependencies to dependencies
- Convention: named exports only, `[moduleName]` error/warning prefix, `.ts` import extensions
- Convention: tsc-only build — plugin compiles to `dist/vite/index.js` and runs inside consumers' Vite processes
- Convention: no default exports for functions (virtual module itself uses `export default` for the array)

## Steps

### 1. Create `src/vite/parse-feature-file.ts` ✅

Migrated AST helper functions from the reference implementation into a typed module:
- `getPropName(prop)` — resolve AST Property key name (Identifier or Literal)
- `extractLiteralValue(node)` — extract static literal from AST node (string, number, boolean, array, negative unary)
- `parseSource(source, filePath)` — acorn parse with error handling
- `findDefineFeatureArg(ast)` — find ObjectExpression in `export default defineFeature({...})`
- `extractMetadata(objectNode, filePath)` — validate and extract all metadata fields with strict type guards
- Exported `parseFeatureFile(code, filePath)` entry point returning `ParsedFeatureMeta | null`

**Done when:** `parseFeatureFile(code, filePath)` compiles with tsc, returns typed `ParsedFeatureMeta | null`, handles all edge cases from reference impl. ✅

### 2. Implement `featureMetadataPlugin()` in `src/vite/index.ts` ✅

Migrated the Vite plugin from the reference implementation:
- `configResolved` hook to resolve srcDir
- `resolveId` hook for `virtual:feature-metadata` → `\0virtual:feature-metadata`
- `load` hook: glob `*.feature.js` files, parse each with `parseFeatureFile()`, generate virtual module code with lazy imports
- `handleHotUpdate` hook: invalidate virtual module when `.feature.js` files change
- Duplicate ID detection via `Set`
- Filter out `enabled: false` features

**Done when:** plugin returns resolveId + load + handleHotUpdate hooks, generates valid virtual module code string with `export default [...]`. ✅

### 3. Move acorn to dependencies in `package.json` ✅

The plugin runs inside consumers' Vite builds, so acorn must be a runtime dependency.

**Done when:** acorn listed under `dependencies`, not `devDependencies`. ✅

### 4. Write tests in `src/__tests__/vite-plugin.test.ts` ✅

40 tests total: 29 `parseFeatureFile` unit tests + 11 `featureMetadataPlugin` tests (6 basic + 5 integration with real temp files).

**Done when:** tests cover all required scenarios. ✅

### 5. Fix P0/P1 findings from code review ✅ [discovered during implementation]

Applied fixes from dual code-reviewer + code-attacker pipeline:
- Null literal bypass: changed `=== undefined` to `== null` in required-field check
- Priority type guard: reject non-number values
- Global type guard: reject non-boolean values
- Enabled type guard: reject non-boolean values
- Timeout type guard: reject non-positive-number values
- Array element validation: reject non-string elements in selectors/dependencies
- readFileSync wrapped in try/catch
- srcDir typed as `string | undefined` with explicit guard
- All fields serialized with `JSON.stringify()` in buildEntry
- Glob errors caught and logged

**Done when:** all P0/P1 findings resolved, tests pass. ✅

## Interfaces

```typescript
interface FeatureMetadataPluginOptions {
  include?: string;
}

interface ParsedFeatureMeta {
  id: string;
  selectors: string[];
  priority: number;
  global: boolean;
  dependencies: string[];
  timeout: number | null;
  enabled: boolean;
}
```

## Function Design

| File | Function | Single Concern |
|------|----------|----------------|
| `src/vite/parse-feature-file.ts` | `getPropName(prop)` | Resolve AST Property key name |
| `src/vite/parse-feature-file.ts` | `extractLiteralValue(node)` | Extract static literal from AST node |
| `src/vite/parse-feature-file.ts` | `parseSource(source, filePath)` | Acorn parse with error handling |
| `src/vite/parse-feature-file.ts` | `findDefineFeatureArg(ast)` | Find ObjectExpression in `export default defineFeature({...})` |
| `src/vite/parse-feature-file.ts` | `extractMetadata(objectNode, filePath)` | Validate and extract all metadata fields |
| `src/vite/parse-feature-file.ts` | `parseFeatureFile(code, filePath)` | Entry point: parse + extract, return typed result or null |
| `src/vite/index.ts` | `findFeatureFiles(srcDir, include?)` | Glob for feature files with error handling |
| `src/vite/index.ts` | `buildEntry(meta, filePath)` | Serialize ParsedFeatureMeta to JS object literal string |
| `src/vite/index.ts` | `featureMetadataPlugin(options?)` | Create Vite Plugin with configResolved + resolveId + load + handleHotUpdate |

## Acceptance Criteria (EARS)

- **AC-1.** The system **shall** export `featureMetadataPlugin()` from the `./vite` entry point that returns a valid Vite `Plugin` object. [from issue] ✅
- **AC-2.** When `featureMetadataPlugin` runs during a Vite build, it **shall** scan all `*.feature.js` files matching the configured glob pattern using AST parsing (Acorn). [from issue] ✅
- **AC-3.** When a consumer imports `virtual:feature-metadata`, the plugin **shall** resolve and load a virtual module exporting a `FeatureMeta[]` array. [from issue] ✅
- **AC-4.** For each scanned `*.feature.js` file, the plugin **shall** extract `id`, `selectors`, `priority`, `global`, `dependencies`, and `timeout` from the `defineFeature()` call's object argument via AST. [inferred] ✅
- **AC-5.** Each `FeatureMeta` entry in the virtual module **shall** include a `load` property as a dynamic `import()` expression pointing to the source file, enabling automatic code splitting. [from issue] ✅
- **AC-6.** If a `*.feature.js` file cannot be parsed or does not contain a `defineFeature()` call, the plugin **shall** emit a Vite warning and skip that file without failing the build. [inferred] ✅
- **AC-7.** The plugin **shall** be fully typed in TypeScript with a `FeatureMetadataPluginOptions` interface for configuration. [from issue] ✅
- **AC-8.** When a `*.feature.js` file is added, removed, or modified during Vite dev server HMR, the virtual module **shall** be invalidated so the next import reflects the updated metadata. [inferred] ✅
- **AC-9.** The plugin **shall** validate metadata field types at parse time: id must be string, priority must be number, global must be boolean, enabled must be boolean, timeout must be positive number. [discovered during implementation] ✅
- **AC-10.** The plugin **shall** reject null literals in required fields and non-string elements in array fields (selectors, dependencies). [discovered during implementation] ✅

## Out of Scope

- Runtime loader changes — `loadFeatures()` is already complete from issue #4
- Feature file authoring validation — `defineFeature()` handles that at runtime
- Plugin configuration options beyond include glob — match reference impl simplicity

## Edge Cases + Error Handling

| # | Scenario | Source | Handling |
|---|----------|--------|---------|
| 1 | `*.feature.js` has syntax errors | [reference] | Catch acorn parse error, warn with file path, skip |
| 2 | No `defineFeature()` call in file | [reference] | Warn, skip — no entry in virtual module |
| 3 | Non-literal value in metadata field | [reference] | Warn with field name and file path, skip file |
| 4 | Duplicate feature IDs across files | [reference] | Warn with ID and file path, skip duplicate |
| 5 | `enabled: false` on a feature | [reference] | Parse but exclude from virtual module output |
| 6 | No `*.feature.js` files match glob | [reference] | Return `export default []` |
| 7 | `timeout` is not a positive number | [reference] | Warn, skip file |
| 8 | File deleted during HMR | [reference] | Invalidate module; re-scan excludes deleted file |
| 9 | Null literal in required field (e.g. `id: null`) | [discovered during implementation] | `== null` check catches both null and undefined, warns and skips |
| 10 | Non-numeric priority (e.g. `priority: "high"`) | [discovered during implementation] | Type guard rejects, warns and skips file |
| 11 | Non-boolean global (e.g. `global: "yes"`) | [discovered during implementation] | Type guard rejects, warns and skips file |
| 12 | Non-string array elements (e.g. `selectors: [1, true]`) | [discovered during implementation] | extractLiteralValue returns undefined for non-string elements, warns and skips |
| 13 | readFileSync fails (permissions, race condition) | [discovered during implementation] | try/catch, warn with file path, skip file |
| 14 | configResolved not called before load | [discovered during implementation] | Throws explicit error with descriptive message |
| 15 | Glob pattern errors | [discovered during implementation] | try/catch, warn with pattern and srcDir, return empty array |
| 16 | Zero timeout (`timeout: 0`) | [discovered during implementation] | Rejected by `value <= 0` guard, same as negative |
| 17 | Explicit `timeout: null` in source | [discovered during implementation] | Rejected — extractLiteralValue returns undefined for null. Users should omit timeout field (defaults to null) |

## Done Criteria per Feature

| Feature | Done when |
|---------|-----------|
| AST parsing module | AC-2, AC-4, AC-6, AC-9, AC-10 ✅ |
| Plugin creation | AC-1, AC-7 ✅ |
| Virtual module generation | AC-3, AC-5 ✅ |
| HMR support | AC-8 ✅ |

## Risks

| Risk | Mitigation | Status |
|------|------------|--------|
| acorn as runtime dependency increases package size | acorn is ~125KB, already a transitive dep of Vite/Rollup — minimal impact | Accepted |
| Static analysis can't extract non-literal values | Warn at build time, matching reference behavior — documented limitation | Accepted |
| ESM module mocking fails in vitest | Switched to real filesystem integration tests with temp directories in os.tmpdir() | Resolved |
| Reference impl has type holes (string priority, string global produce broken JS) | Added strict type guards not present in reference — intentional improvement | Resolved |

## Test Strategy

- **Unit tests for parse functions (29 tests):** valid feature file extraction (all fields, optional defaults, negative priority, onEach/onSetup/both hooks), syntax errors, missing `defineFeature()`, non-literal values, null literals, type validation (non-numeric priority, non-boolean global/enabled, non-positive timeout, zero timeout), non-string array elements, computed properties, empty source
- **Unit tests for plugin (6 tests):** exports function, returns Plugin with correct name, resolves virtual module ID, ignores non-virtual IDs, accepts include option, throws if configResolved not called
- **Integration tests (5 tests):** real temp files with `mkdirSync`/`writeFileSync` — empty glob output, duplicate ID skipping, `enabled: false` filtering, full virtual module generation with all fields, parse error skipping
- **Results:** 99/99 tests pass across 3 test files (920ms)

## API Comparison with Reference

| Aspect | toggl-site (reference) | feature-engine | Intentional? |
|--------|----------------------|----------------|--------------|
| Export style | `export default function` | `export function` (named) | Yes — package convention |
| Options param | None | `options?: { include?: string }` | Yes — additive, non-breaking |
| Serialization | Bare template literals | `JSON.stringify()` for all fields | Yes — functionally equivalent, safer |
| Type validation | None | Strict guards for id/priority/global/enabled/timeout | Yes — fixes P0 bugs in reference |
| Required-field check | `=== undefined` | `== null` | Yes — catches null literals |
| Array element check | Any literal accepted | String-only | Yes — prevents broken selectors |
| readFileSync | No error handling | try/catch, warn, skip | Yes — robustness |
| HMR filter | `.feature.js` AND `/features/` | `.feature.js` suffix only | Yes — compatible with configurable glob |
| Warning prefix | `[feature-metadata]` | `[featureMetadataPlugin]` | Cosmetic |
| Virtual module output | Same shape | Same shape | N/A — identical |
