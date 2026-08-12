import { coverageConfigDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
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
      ],
      // Absolute counts, not percentages: at 654 statements a single percentage
      // point is worth ~7 statements, so a percentage gate would let several
      // uncovered lines slip in between rounding boundaries. Negative numbers are
      // read by vitest as "at most this many uncovered items".
      thresholds: {
        statements: -11,
        branches: -8,
        lines: -11,
        // Every function is currently covered. Expressed as the positive
        // percentage 100 rather than -0, because `-0 >= 0` is true in JS and a
        // -0 gate would silently pass no matter how many functions went uncovered.
        functions: 100,
      },
    },
  },
  bench: {
    include: ['src/**/*.bench.ts'],
  },
});
