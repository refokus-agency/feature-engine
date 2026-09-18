import {
  coverageConfigDefaults,
  defaultExclude,
  defineConfig,
} from 'vitest/config';

// Nested git worktrees are full checkouts of this repo, so their `src/` matches
// every discovery glob — each one adds a duplicate of every test file and a
// second copy of the source being measured. The directory is gitignored, but
// vitest globs the filesystem rather than the index, so it has to be excluded
// explicitly. Test discovery, benchmark discovery and the coverage provider each
// walk their own glob and inherit nothing from one another, which is why the
// same guard is applied in all three places below. CI never sees any of this —
// it only ever breaks local runs.
const NESTED_WORKTREES = '**/.claude/**';
const DISCOVERY_EXCLUDE = [...defaultExclude, NESTED_WORKTREES];

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    exclude: DISCOVERY_EXCLUDE,
    benchmark: {
      // Benchmark discovery is configured here, not under a root-level `bench`
      // key — that is not a vitest option and was silently ignored, which is why
      // the default `**/*.bench.*` glob was reaching outside src/.
      include: ['src/**/*.bench.ts'],
      exclude: DISCOVERY_EXCLUDE,
    },
    coverage: {
      provider: 'v8',
      exclude: [
        ...coverageConfigDefaults.exclude,
        // Type-only declarations. They are erased at runtime, so there is no
        // statement for v8 to instrument — structurally uncoverable.
        'src/types.ts',
        // Barrel re-export. Every line is an `export ... from`, which carries no
        // logic of its own; the modules behind it are measured directly.
        'src/index.ts',
        // Test scaffolding is not shipped code — measuring it only dilutes the
        // number for src/. Vitest excludes *.test.ts on its own; the shared
        // helpers and benchmarks under __tests__ need saying explicitly.
        'src/__tests__/**',
        NESTED_WORKTREES,
      ],
      // Absolute counts, not percentages: at 344 statements a single percentage
      // point is worth ~3 statements, so a percentage gate would let several
      // uncovered lines slip in between rounding boundaries. Negative numbers are
      // read by vitest as "at most this many uncovered items".
      //
      // These counts are provider-specific. vitest 4 rewrote how the v8 provider
      // maps raw coverage back to source, so the totals and the uncovered counts
      // both moved when it landed — they are not comparable to the vitest 3
      // numbers that were here before. The vitest 5 upgrade moved the totals
      // again (346 -> 344 statements, 311 -> 310 lines) but left every uncovered
      // count untouched, which is exactly why these are absolute counts and not
      // percentages. Recalibrate against a real run rather than adjusting them by
      // hand.
      thresholds: {
        statements: -9,
        branches: -9,
        lines: -4,
        // Every function is currently covered. Expressed as the positive
        // percentage 100 rather than -0, because `-0 >= 0` is true in JS and a
        // -0 gate would silently pass no matter how many functions went uncovered.
        functions: 100,
      },
    },
  },
});
