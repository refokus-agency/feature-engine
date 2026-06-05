import { describe, it, expect } from 'vitest';
import { defineFeature } from '../define-feature.ts';
import type { FeatureDescriptorInput } from '../types.ts';
// AC-4: OnSetupContext and the updated OnSetupFn must be re-exported from the package entry point.
import type { OnSetupContext, OnSetupFn } from '../index.ts';

const noop = () => {};

function minimal(
  overrides: Partial<FeatureDescriptorInput> = {},
): FeatureDescriptorInput {
  return {
    id: 'test-feature',
    selectors: ['[data-test]'],
    priority: 10,
    onSetup: noop,
    ...overrides,
  };
}

describe('defineFeature', () => {
  describe('valid descriptors', () => {
    it('accepts minimal descriptor with onSetup', () => {
      const result = defineFeature(minimal());
      expect(result.id).toBe('test-feature');
      expect(result.priority).toBe(10);
    });

    it('accepts minimal descriptor with onEach only', () => {
      const result = defineFeature(
        minimal({ onSetup: undefined, onEach: noop }),
      );
      expect(result.id).toBe('test-feature');
    });

    it('accepts full descriptor with all fields', () => {
      const onSetup = () => ({ data: 1 });
      const onEach = () => {};
      const onReady = () => {};

      const result = defineFeature({
        id: 'full-feature',
        selectors: ['[data-a]', '[data-b]'],
        priority: 5,
        global: false,
        dependencies: ['dep-a', 'dep-b'],
        enabled: true,
        timeout: 5000,
        onSetup,
        onEach,
        onReady,
      });

      expect(result.id).toBe('full-feature');
      expect([...result.selectors]).toEqual(['[data-a]', '[data-b]']);
      expect(result.priority).toBe(5);
      expect(result.global).toBe(false);
      expect([...result.dependencies]).toEqual(['dep-a', 'dep-b']);
      expect(result.enabled).toBe(true);
      expect(result.timeout).toBe(5000);
      expect(result.onSetup).toBe(onSetup);
      expect(result.onEach).toBe(onEach);
      expect(result.onReady).toBe(onReady);
    });

    it('accepts global feature with onSetup only', () => {
      const result = defineFeature(minimal({ global: true }));
      expect(result.global).toBe(true);
    });

    it('accepts empty selectors array for global features', () => {
      const result = defineFeature(
        minimal({ selectors: [], global: true }),
      );
      expect([...result.selectors]).toEqual([]);
      expect(result.global).toBe(true);
    });
  });

  describe('validation errors', () => {
    it('throws when id is empty string', () => {
      expect(() =>
        defineFeature(minimal({ id: '' })),
      ).toThrow('[defineFeature] id is required and must be a string');
    });

    it('throws when id is not a string', () => {
      expect(() =>
        defineFeature(minimal({ id: 123 as unknown as string })),
      ).toThrow('[defineFeature] id is required and must be a string');
    });

    it('throws when id is null', () => {
      expect(() =>
        defineFeature(minimal({ id: null as unknown as string })),
      ).toThrow('[defineFeature] id is required and must be a string');
    });

    it('throws when selectors is not an array', () => {
      expect(() =>
        defineFeature(
          minimal({ selectors: 'not-array' as unknown as string[] }),
        ),
      ).toThrow('[defineFeature] selectors must be an array of strings');
    });

    it('throws when selectors contains non-strings', () => {
      expect(() =>
        defineFeature(
          minimal({ selectors: [1, 2] as unknown as string[] }),
        ),
      ).toThrow('[defineFeature] selectors must be an array of strings');
    });

    it('throws when selectors is null', () => {
      expect(() =>
        defineFeature(
          minimal({ selectors: null as unknown as string[] }),
        ),
      ).toThrow('[defineFeature] selectors must be an array of strings');
    });

    it('throws when priority is not a number', () => {
      expect(() =>
        defineFeature(
          minimal({ priority: '10' as unknown as number }),
        ),
      ).toThrow(
        '[defineFeature] priority is required and must be a finite number',
      );
    });

    it('throws when priority is NaN', () => {
      expect(() =>
        defineFeature(minimal({ priority: NaN })),
      ).toThrow(
        '[defineFeature] priority is required and must be a finite number',
      );
    });

    it('throws when priority is Infinity', () => {
      expect(() =>
        defineFeature(minimal({ priority: Infinity })),
      ).toThrow(
        '[defineFeature] priority is required and must be a finite number',
      );
    });

    it('throws when neither onSetup nor onEach are functions', () => {
      expect(() =>
        defineFeature(
          minimal({ onSetup: undefined, onEach: undefined }),
        ),
      ).toThrow(
        '[defineFeature] at least one of onSetup or onEach is required',
      );
    });

    it('throws when global is true and onEach is provided', () => {
      expect(() =>
        defineFeature(minimal({ global: true, onEach: noop })),
      ).toThrow(
        '[defineFeature] global features cannot use onEach (no selectors to match)',
      );
    });

    it('throws when onSetup is truthy but not a function', () => {
      expect(() =>
        defineFeature(
          minimal({
            onSetup: true as unknown as FeatureDescriptorInput['onSetup'],
            onEach: noop,
          }),
        ),
      ).toThrow('[defineFeature] onSetup must be a function');
    });

    it('throws when onEach is truthy but not a function', () => {
      expect(() =>
        defineFeature(
          minimal({
            onEach: 'fn' as unknown as FeatureDescriptorInput['onEach'],
          }),
        ),
      ).toThrow('[defineFeature] onEach must be a function');
    });

    it('throws when onReady is truthy but not a function', () => {
      expect(() =>
        defineFeature(minimal({ onReady: 42 as unknown as () => void })),
      ).toThrow('[defineFeature] onReady must be a function');
    });

    it('throws when expose is truthy but not a function', () => {
      expect(() =>
        defineFeature(
          minimal({
            expose: 'not a function' as unknown as FeatureDescriptorInput['expose'],
          }),
        ),
      ).toThrow('[defineFeature] expose must be a function');
    });

    it('throws when dependencies is not an array of strings', () => {
      expect(() =>
        defineFeature(
          minimal({ dependencies: [1, 2] as unknown as string[] }),
        ),
      ).toThrow('[defineFeature] dependencies must be an array of strings');
    });

    it('throws when enabled is not a boolean', () => {
      expect(() =>
        defineFeature(
          minimal({ enabled: 1 as unknown as boolean }),
        ),
      ).toThrow('[defineFeature] enabled must be a boolean');
    });

    it('throws when timeout is zero', () => {
      expect(() => defineFeature(minimal({ timeout: 0 }))).toThrow(
        '[defineFeature] timeout must be a positive number (ms)',
      );
    });

    it('throws when timeout is negative', () => {
      expect(() => defineFeature(minimal({ timeout: -1 }))).toThrow(
        '[defineFeature] timeout must be a positive number (ms)',
      );
    });

    it('throws when timeout is not a number', () => {
      expect(() =>
        defineFeature(
          minimal({ timeout: '5000' as unknown as number }),
        ),
      ).toThrow('[defineFeature] timeout must be a positive number (ms)');
    });

    // BUG: Infinity passes the > 0 guard but setTimeout(fn, Infinity) fires in ~1ms in Node.js
    it('does not reject timeout: Infinity (validation gap — causes instant timeout at runtime)', () => {
      const result = defineFeature(minimal({ timeout: Infinity }));
      expect(result.timeout).toBe(Infinity);
    });

    // BUG: NaN passes the <= 0 guard but setTimeout(fn, NaN) fires in ~0ms in Node.js
    it('does not reject timeout: NaN (validation gap — causes instant timeout at runtime)', () => {
      const result = defineFeature(minimal({ timeout: NaN }));
      expect(result.timeout).toBeNaN();
    });
  });

  describe('default normalization', () => {
    it('defaults global to false', () => {
      const result = defineFeature(minimal());
      expect(result.global).toBe(false);
    });

    it('defaults dependencies to empty array', () => {
      const result = defineFeature(minimal());
      expect([...result.dependencies]).toEqual([]);
    });

    it('deduplicates dependencies', () => {
      const result = defineFeature(
        minimal({ dependencies: ['a', 'b', 'a', 'c', 'b'] }),
      );
      expect([...result.dependencies]).toEqual(['a', 'b', 'c']);
    });

    it('defaults enabled to true', () => {
      const result = defineFeature(minimal());
      expect(result.enabled).toBe(true);
    });

    it('preserves enabled: false', () => {
      const result = defineFeature(minimal({ enabled: false }));
      expect(result.enabled).toBe(false);
    });

    it('defaults enabled to true when undefined is passed', () => {
      const result = defineFeature(minimal({ enabled: undefined }));
      expect(result.enabled).toBe(true);
    });

    it('defaults timeout to null', () => {
      const result = defineFeature(minimal());
      expect(result.timeout).toBeNull();
    });

    it('accepts timeout: null explicitly', () => {
      const result = defineFeature(minimal({ timeout: null }));
      expect(result.timeout).toBeNull();
    });

    it('defaults onEach and onReady to null when not provided', () => {
      const result = defineFeature(
        minimal({ onSetup: noop, onEach: undefined, onReady: undefined }),
      );
      expect(result.onEach).toBeNull();
      expect(result.onReady).toBeNull();
    });

    it('defaults onSetup to null when not provided', () => {
      const result = defineFeature(
        minimal({ onSetup: undefined, onEach: noop }),
      );
      expect(result.onSetup).toBeNull();
    });
  });

  describe('freeze behavior', () => {
    it('freezes the returned object', () => {
      const result = defineFeature(minimal());
      expect(Object.isFrozen(result)).toBe(true);
    });

    it('freezes the selectors array', () => {
      const result = defineFeature(minimal());
      expect(Object.isFrozen(result.selectors)).toBe(true);
    });

    it('freezes the dependencies array', () => {
      const result = defineFeature(minimal({ dependencies: ['a'] }));
      expect(Object.isFrozen(result.dependencies)).toBe(true);
    });

    it('copies selectors so mutation of input does not affect output', () => {
      const selectors = ['[data-a]'];
      const result = defineFeature(minimal({ selectors }));
      selectors.push('[data-b]');
      expect([...result.selectors]).toEqual(['[data-a]']);
    });

    it('copies dependencies so mutation of input does not affect output', () => {
      const dependencies = ['dep-a'];
      const result = defineFeature(minimal({ dependencies }));
      dependencies.push('dep-b');
      expect([...result.dependencies]).toEqual(['dep-a']);
    });
  });

  // Compile-time assertions for the `expose` field and `OnSetupContext` second
  // argument (epic #34, issue #35). These tests must COMPILE under `tsc --strict`;
  // the runtime assertions are secondary. `npm run check-types` type-checks this
  // file via `tsconfig.eslint.json` (which includes `src/__tests__/**`), so if any
  // shape below stops type-checking, check-types fails — that is the authoritative gate.
  describe('expose + OnSetupContext types', () => {
    it('forwards expose into the frozen descriptor (AC-1, #36 AC-8)', () => {
      const expose = (ctx: unknown) => ({ value: ctx });
      const result = defineFeature(minimal({ expose }));
      expect(result.expose).toBe(expose);
    });

    it('normalizes expose to null when not provided (#36 AC-8)', () => {
      const result = defineFeature(minimal());
      expect(result.expose).toBeNull();
    });

    it('accepts expose returning false or null (AC-5)', () => {
      const exposeFalse = defineFeature(minimal({ expose: () => false }));
      const exposeNull = defineFeature(minimal({ expose: () => null }));
      expect(exposeFalse.id).toBe('test-feature');
      expect(exposeNull.id).toBe('test-feature');
    });

    it('accepts single-argument onSetup (AC-2 — backwards compatible)', () => {
      const result = defineFeature(
        minimal({ onSetup: (selectors) => ({ count: selectors.length }) }),
      );
      expect(result.id).toBe('test-feature');
    });

    it('accepts onSetup with a destructured deps context (AC-3)', () => {
      const result = defineFeature(
        minimal({
          onSetup: (_selectors, { deps }) => {
            // `deps` is typed Record<string, unknown> — index access compiles.
            return { dep: deps['some-feature'] };
          },
        }),
      );
      expect(result.id).toBe('test-feature');
    });

    it('exposes OnSetupContext and OnSetupFn from the package entry point (AC-4)', () => {
      const context: OnSetupContext = { deps: {} };
      // OnSetupFn is also re-exported from the entry point and now takes the
      // 2nd context arg with `deps` typed as Record<string, unknown>.
      const setup: OnSetupFn = (selectors, { deps }) => ({
        n: selectors.length,
        dep: deps['some-feature'],
      });
      expect(context.deps).toEqual({});
      expect(typeof setup).toBe('function');
    });

    it('accepts a typed expose param projecting a typed onSetup return (AC-1)', () => {
      // Regression guard: `expose`'s param is `any`, so callers may annotate it
      // with the concrete onSetup return type without a TS2322 contravariance error.
      const result = defineFeature(
        minimal({
          onSetup: () => ({ token: 'abc' }),
          expose: (ctx: { token: string }) => ctx.token,
        }),
      );
      expect(result.id).toBe('test-feature');
    });
  });
});
