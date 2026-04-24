import { describe, it, expect } from 'vitest';
import { defineFeature } from '../define-feature.ts';
import type { FeatureDescriptorInput } from '../types.ts';

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
  });
});
