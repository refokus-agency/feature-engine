import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { loadFeatures } from '../loader.ts';
import { defineFeature } from '../define-feature.ts';
import type {
  FeatureDescriptor,
  FeatureDescriptorInput,
  FeatureMeta,
} from '../types.ts';

const noop = () => {};

function makeDescriptor(
  overrides: Partial<FeatureDescriptor> = {},
): FeatureDescriptor {
  return {
    id: 'test',
    selectors: [],
    priority: 0,
    global: false,
    dependencies: [],
    enabled: true,
    timeout: null,
    onSetup: null,
    onEach: null,
    onReady: null,
    expose: null,
    ...overrides,
  };
}

function makeMeta(overrides: Partial<FeatureMeta> = {}): FeatureMeta {
  const descriptor = makeDescriptor({ id: overrides.id ?? 'test' });
  return {
    id: 'test',
    selectors: [],
    priority: 0,
    global: false,
    dependencies: [],
    timeout: null,
    load: () => Promise.resolve({ default: descriptor }),
    ...overrides,
  };
}

function makeLoadable(
  id: string,
  descriptor: Partial<FeatureDescriptor>,
  meta: Partial<FeatureMeta> = {},
): FeatureMeta {
  const full = makeDescriptor({ id, ...descriptor });
  const derivedSelectors = full.selectors as string[];
  return makeMeta({
    id,
    selectors: derivedSelectors,
    load: () => Promise.resolve({ default: full }),
    ...meta,
  });
}

// Integration helper (#38): builds a loadable FeatureMeta from a REAL `defineFeature` descriptor,
// exercising the full defineFeature → loadFeatures path (not a hand-built descriptor). The meta
// fields are mirrored from the frozen descriptor so matching/waves/deps stay in sync.
function defineLoadable(
  input: FeatureDescriptorInput,
  metaOverrides: Partial<FeatureMeta> = {},
): FeatureMeta {
  const descriptor = defineFeature(input);
  return {
    id: descriptor.id,
    selectors: [...descriptor.selectors],
    priority: descriptor.priority,
    global: descriptor.global,
    dependencies: [...descriptor.dependencies],
    timeout: descriptor.timeout,
    load: () => Promise.resolve({ default: descriptor }),
    ...metaOverrides,
  };
}

describe('loadFeatures', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  describe('happy path', () => {
    it('initializes a global feature', async () => {
      const onSetup = vi.fn();
      const features = [
        makeLoadable('hero', { onSetup }, { global: true, priority: 1 }),
      ];

      await loadFeatures(features);

      expect(onSetup).toHaveBeenCalledOnce();
    });

    it('initializes a feature matched by DOM selector', async () => {
      document.body.innerHTML = '<div data-hero></div>';
      const onSetup = vi.fn();
      const features = [
        makeLoadable(
          'hero',
          { onSetup, selectors: ['[data-hero]'] },
          { priority: 1 },
        ),
      ];

      await loadFeatures(features);

      expect(onSetup).toHaveBeenCalledOnce();
    });

    it('runs onSetup → onEach → onReady in order', async () => {
      document.body.innerHTML = '<div data-item></div><div data-item></div>';
      const order: string[] = [];
      const features = [
        makeLoadable(
          'lifecycle',
          {
            onSetup: () => {
              order.push('setup');
            },
            onEach: () => {
              order.push('each');
            },
            onReady: () => {
              order.push('ready');
            },
            selectors: ['[data-item]'],
          },
          { global: false, priority: 1 },
        ),
      ];

      await loadFeatures(features);

      expect(order).toEqual(['setup', 'each', 'each', 'ready']);
    });

    it('passes ctx from onSetup to onEach', async () => {
      document.body.innerHTML = '<div data-x></div>';
      let receivedCtx: unknown;
      const features = [
        makeLoadable(
          'ctx-pass',
          {
            onSetup: () => ({ magic: 42 }),
            onEach: ({ ctx }) => {
              receivedCtx = ctx;
            },
            selectors: ['[data-x]'],
          },
          { priority: 1 },
        ),
      ];

      await loadFeatures(features);

      expect(receivedCtx).toEqual({ magic: 42 });
    });

    it('passes correct { el, index, elements, ctx } shape to onEach', async () => {
      document.body.innerHTML = '<div data-el></div><span data-el></span>';
      const calls: Array<{
        el: Element;
        index: number;
        elements: NodeListOf<Element>;
        ctx: unknown;
      }> = [];
      const features = [
        makeLoadable(
          'shape-check',
          {
            onSetup: () => ({ token: 'abc' }),
            onEach: (arg: {
              el: Element;
              index: number;
              elements: NodeListOf<Element>;
              ctx: unknown;
            }) => {
              calls.push(arg);
            },
            selectors: ['[data-el]'],
          },
          { priority: 1 },
        ),
      ];

      await loadFeatures(features);

      expect(calls).toHaveLength(2);
      expect(calls[0]!.el.tagName).toBe('DIV');
      expect(calls[0]!.index).toBe(0);
      expect(calls[0]!.elements).toHaveLength(2);
      expect(calls[0]!.ctx).toEqual({ token: 'abc' });
      expect(calls[1]!.el.tagName).toBe('SPAN');
      expect(calls[1]!.index).toBe(1);
      expect(calls[1]!.elements).toHaveLength(2);
      expect(calls[1]!.ctx).toEqual({ token: 'abc' });
    });

    it('fires onReady when onSetup is null but onEach is present', async () => {
      document.body.innerHTML = '<div data-r></div>';
      const onEach = vi.fn();
      const onReady = vi.fn();
      const features = [
        makeLoadable(
          'ready-no-setup',
          {
            onSetup: null,
            onEach,
            onReady,
            selectors: ['[data-r]'],
          },
          { priority: 1 },
        ),
      ];

      await loadFeatures(features);

      expect(onEach).toHaveBeenCalledOnce();
      expect(onReady).toHaveBeenCalledOnce();
    });

    it('sorts features by priority', async () => {
      const order: string[] = [];
      const features = [
        makeLoadable(
          'b',
          {
            onSetup: () => {
              order.push('b');
            },
          },
          { global: true, priority: 20 },
        ),
        makeLoadable(
          'a',
          {
            onSetup: () => {
              order.push('a');
            },
          },
          { global: true, priority: 10 },
        ),
      ];

      await loadFeatures(features);

      expect(order).toEqual(['a', 'b']);
    });
  });

  describe('dependency ordering (topological sort)', () => {
    let warnSpy: MockInstance<typeof console.warn>;
    beforeEach(() => {
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(noop);
    });

    it('initializes dependencies before dependents', async () => {
      const order: string[] = [];
      const features = [
        makeLoadable(
          'child',
          {
            onSetup: () => {
              order.push('child');
            },
          },
          { global: true, priority: 1, dependencies: ['parent'] },
        ),
        makeLoadable(
          'parent',
          {
            onSetup: () => {
              order.push('parent');
            },
          },
          { global: true, priority: 2 },
        ),
      ];

      await loadFeatures(features);

      expect(order).toEqual(['parent', 'child']);
    });

    it('handles circular dependencies without throwing', async () => {
      const aSetup = vi.fn();
      const bSetup = vi.fn();
      const features = [
        makeLoadable(
          'a',
          { onSetup: aSetup },
          { global: true, priority: 1, dependencies: ['b'], timeout: 100 },
        ),
        makeLoadable(
          'b',
          { onSetup: bSetup },
          { global: true, priority: 2, dependencies: ['a'], timeout: 100 },
        ),
      ];

      await loadFeatures(features, { timeout: 100 });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Circular dependency'),
      );
      expect(aSetup).toHaveBeenCalledOnce();
      expect(bSetup).toHaveBeenCalledOnce();
    });

    it('resolves a deep 3-level dependency chain in correct order', async () => {
      const order: string[] = [];
      const features = [
        makeLoadable(
          'c',
          {
            onSetup: () => {
              order.push('c');
            },
          },
          { global: true, priority: 1, dependencies: ['b'] },
        ),
        makeLoadable(
          'b',
          {
            onSetup: () => {
              order.push('b');
            },
          },
          { global: true, priority: 2, dependencies: ['a'] },
        ),
        makeLoadable(
          'a',
          {
            onSetup: () => {
              order.push('a');
            },
          },
          { global: true, priority: 3 },
        ),
      ];

      await loadFeatures(features);

      expect(order).toEqual(['a', 'b', 'c']);
    });

    it('warns on unknown dependency and ignores it', async () => {
      const onSetup = vi.fn();
      const features = [
        makeLoadable(
          'feat',
          { onSetup },
          { global: true, priority: 1, dependencies: ['nonexistent'] },
        ),
      ];

      await loadFeatures(features);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('unknown "nonexistent"'),
      );
      expect(onSetup).toHaveBeenCalledOnce();
    });
  });

  describe('timeout', () => {
    let warnSpy: MockInstance<typeof console.warn>;
    beforeEach(() => {
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(noop);
    });

    it('rejects a feature that exceeds its timeout', async () => {
      const features = [
        makeLoadable(
          'slow',
          { onSetup: () => new Promise(() => {}) },
          { global: true, priority: 1, timeout: 50 },
        ),
      ];

      await loadFeatures(features);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Feature "slow" failed:'),
        expect.objectContaining({
          message: expect.stringContaining('timed out'),
        }),
      );
    });

    it('continues to next feature after timeout (AC-5)', async () => {
      const nextSetup = vi.fn();
      const features = [
        makeLoadable(
          'slow',
          { onSetup: () => new Promise(() => {}) },
          { global: true, priority: 1, timeout: 50 },
        ),
        makeLoadable(
          'fast',
          { onSetup: nextSetup },
          { global: true, priority: 2 },
        ),
      ];

      await loadFeatures(features);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Feature "slow" failed:'),
        expect.objectContaining({
          message: expect.stringContaining('timed out'),
        }),
      );
      expect(nextSetup).toHaveBeenCalledOnce();
    });

    it('uses global timeout when per-feature timeout is null', async () => {
      const features = [
        makeLoadable(
          'slow',
          { onSetup: () => new Promise(() => {}) },
          { global: true, priority: 1, timeout: null },
        ),
      ];

      await loadFeatures(features, { timeout: 50 });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Feature "slow" failed:'),
        expect.objectContaining({
          message: expect.stringContaining('timed out'),
        }),
      );
    });

    it('does not apply timeout when timeout is 0', async () => {
      let resolved = false;
      const features = [
        makeLoadable(
          'async-no-timeout',
          {
            onSetup: () =>
              new Promise((r) =>
                setTimeout(() => {
                  resolved = true;
                  r(undefined);
                }, 60),
              ),
          },
          { global: true, priority: 1, timeout: 0 },
        ),
      ];

      await loadFeatures(features, { timeout: 0 });

      expect(resolved).toBe(true);
      const timeoutWarnings = warnSpy.mock.calls.filter(
        (c) => typeof c[0] === 'string' && c[0].includes('timed out'),
      );
      expect(timeoutWarnings).toHaveLength(0);
    });

    it('per-feature timeout overrides global timeout', async () => {
      const onSetup = vi.fn(
        () => new Promise((resolve) => setTimeout(resolve, 120)),
      );
      const features = [
        makeLoadable(
          'slow-ok',
          { onSetup },
          { global: true, priority: 1, timeout: 300 },
        ),
      ];

      await loadFeatures(features, { timeout: 50 });

      expect(onSetup).toHaveBeenCalledOnce();
      const timeoutWarnings = warnSpy.mock.calls.filter(
        (c) => typeof c[0] === 'string' && c[0].includes('timed out'),
      );
      expect(timeoutWarnings).toHaveLength(0);
    });

    it('warns and uses default when global timeout is negative', async () => {
      const onSetup = vi.fn();
      const features = [
        makeLoadable('feat', { onSetup }, { global: true, priority: 1 }),
      ];

      await loadFeatures(features, { timeout: -500 });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid timeout'),
      );
      expect(onSetup).toHaveBeenCalledOnce();
    });
  });

  describe('chunk load failure', () => {
    let warnSpy: MockInstance<typeof console.warn>;
    beforeEach(() => {
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(noop);
    });

    it('warns and continues when a chunk fails to load', async () => {
      const onSetup = vi.fn();
      const features: FeatureMeta[] = [
        makeMeta({
          id: 'broken',
          global: true,
          priority: 1,
          load: () => Promise.reject(new Error('network error')),
        }),
        makeLoadable('ok', { onSetup }, { global: true, priority: 2 }),
      ];

      await loadFeatures(features);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load feature "broken"'),
        expect.any(Error),
      );
      expect(onSetup).toHaveBeenCalledOnce();
    });

    it('skips dependent feature when a chunk fails to load', async () => {
      const onSetup = vi.fn();
      const features: FeatureMeta[] = [
        makeMeta({
          id: 'broken',
          global: true,
          priority: 1,
          load: () => Promise.reject(new Error('network error')),
        }),
        makeLoadable(
          'dependent',
          { onSetup },
          { global: true, priority: 2, dependencies: ['broken'] },
        ),
      ];

      await loadFeatures(features);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load feature "broken"'),
        expect.any(Error),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Feature "dependent" skipped'),
      );
      expect(onSetup).not.toHaveBeenCalled();
    });

    it('cascades failure through dependency chain', async () => {
      const bSetup = vi.fn();
      const cSetup = vi.fn();
      const features: FeatureMeta[] = [
        makeMeta({
          id: 'a',
          global: true,
          priority: 1,
          load: () => Promise.reject(new Error('network error')),
        }),
        makeLoadable(
          'b',
          { onSetup: bSetup },
          { global: true, priority: 2, dependencies: ['a'] },
        ),
        makeLoadable(
          'c',
          { onSetup: cSetup },
          { global: true, priority: 3, dependencies: ['b'] },
        ),
      ];

      await loadFeatures(features);

      expect(bSetup).not.toHaveBeenCalled();
      expect(cSetup).not.toHaveBeenCalled();
    });

    it('failure does not spread to non-dependents', async () => {
      const depSetup = vi.fn();
      const indepSetup = vi.fn();
      const features: FeatureMeta[] = [
        makeMeta({
          id: 'broken',
          global: true,
          priority: 1,
          load: () => Promise.reject(new Error('network error')),
        }),
        makeLoadable(
          'dependent',
          { onSetup: depSetup },
          { global: true, priority: 2, dependencies: ['broken'] },
        ),
        makeLoadable(
          'independent',
          { onSetup: indepSetup },
          { global: true, priority: 2 },
        ),
      ];

      await loadFeatures(features);

      expect(depSetup).not.toHaveBeenCalled();
      expect(indepSetup).toHaveBeenCalledOnce();
    });

    it('cascades failure when onSetup throws at runtime', async () => {
      const bSetup = vi.fn();
      const features = [
        makeLoadable(
          'a',
          {
            onSetup: () => {
              throw new Error('runtime');
            },
          },
          { global: true, priority: 1 },
        ),
        makeLoadable(
          'b',
          { onSetup: bSetup },
          { global: true, priority: 2, dependencies: ['a'] },
        ),
      ];

      await loadFeatures(features);

      expect(bSetup).not.toHaveBeenCalled();
    });

    it('cascades runtime failure through dependency chain', async () => {
      const bSetup = vi.fn();
      const cSetup = vi.fn();
      const features = [
        makeLoadable(
          'a',
          {
            onSetup: () => {
              throw new Error('runtime');
            },
          },
          { global: true, priority: 1 },
        ),
        makeLoadable(
          'b',
          { onSetup: bSetup },
          { global: true, priority: 2, dependencies: ['a'] },
        ),
        makeLoadable(
          'c',
          { onSetup: cSetup },
          { global: true, priority: 3, dependencies: ['b'] },
        ),
      ];

      await loadFeatures(features);

      expect(bSetup).not.toHaveBeenCalled();
      expect(cSetup).not.toHaveBeenCalled();
    });

    it('skips feature when any dependency in the list failed', async () => {
      const onSetup = vi.fn();
      const features: FeatureMeta[] = [
        makeLoadable('ok', { onSetup: noop }, { global: true, priority: 1 }),
        makeMeta({
          id: 'broken',
          global: true,
          priority: 1,
          load: () => Promise.reject(new Error('network error')),
        }),
        makeLoadable(
          'dependent',
          { onSetup },
          { global: true, priority: 2, dependencies: ['ok', 'broken'] },
        ),
      ];

      await loadFeatures(features);

      expect(onSetup).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('returns early for empty features array', async () => {
      await expect(loadFeatures([])).resolves.toBeUndefined();
    });

    it('returns early when no features match the DOM', async () => {
      const onSetup = vi.fn();
      const features = [
        makeLoadable(
          'unmatched',
          { onSetup },
          { selectors: ['[data-missing]'], priority: 1 },
        ),
      ];

      await loadFeatures(features);

      expect(onSetup).not.toHaveBeenCalled();
    });

    it('skips onEach and onReady when onSetup returns false', async () => {
      document.body.innerHTML = '<div data-x></div>';
      const onEach = vi.fn();
      const onReady = vi.fn();
      const features = [
        makeLoadable(
          'aborted',
          {
            onSetup: () => false,
            onEach,
            onReady,
            selectors: ['[data-x]'],
          },
          { priority: 1 },
        ),
      ];

      await loadFeatures(features);

      expect(onEach).not.toHaveBeenCalled();
      expect(onReady).not.toHaveBeenCalled();
    });

    it('skips lifecycle when enabled is false', async () => {
      const onSetup = vi.fn();
      const onReady = vi.fn();
      const features = [
        makeLoadable(
          'disabled',
          { enabled: false, onSetup, onReady },
          { global: true, priority: 1 },
        ),
      ];

      await loadFeatures(features);

      expect(onSetup).not.toHaveBeenCalled();
      expect(onReady).not.toHaveBeenCalled();
    });

    it('suppresses console.warn when logging is false', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(noop);
      const features: FeatureMeta[] = [
        makeMeta({
          id: 'broken',
          global: true,
          priority: 1,
          load: () => Promise.reject(new Error('fail')),
        }),
      ];

      await loadFeatures(features, { logging: false });

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('pre-seeds unmatched features as ready to prevent deadlock', async () => {
      const order: string[] = [];
      const unmatched = makeMeta({
        id: 'unmatched',
        selectors: ['[data-gone]'],
        priority: 1,
      });
      const dependent = makeLoadable(
        'dependent',
        {
          onSetup: () => {
            order.push('dependent');
          },
        },
        { global: true, priority: 2, dependencies: ['unmatched'] },
      );

      await loadFeatures([unmatched, dependent]);

      expect(order).toEqual(['dependent']);
    });

    it('calls onEach with ctx undefined when onSetup is absent', async () => {
      document.body.innerHTML = '<div data-u></div>';
      let receivedCtx: unknown = 'sentinel';
      const features = [
        makeLoadable(
          'no-setup-ctx',
          {
            onSetup: null,
            onEach: ({ ctx }: { ctx: unknown }) => {
              receivedCtx = ctx;
            },
            selectors: ['[data-u]'],
          },
          { priority: 1 },
        ),
      ];

      await loadFeatures(features);

      expect(receivedCtx).toBeUndefined();
    });

    it('resolves all features with equal priority', async () => {
      const order: string[] = [];
      const features = [
        makeLoadable(
          'first',
          {
            onSetup: () => {
              order.push('first');
            },
          },
          { global: true, priority: 10 },
        ),
        makeLoadable(
          'second',
          {
            onSetup: () => {
              order.push('second');
            },
          },
          { global: true, priority: 10 },
        ),
        makeLoadable(
          'third',
          {
            onSetup: () => {
              order.push('third');
            },
          },
          { global: true, priority: 10 },
        ),
      ];

      await loadFeatures(features);

      expect(order).toHaveLength(3);
      expect(order).toContain('first');
      expect(order).toContain('second');
      expect(order).toContain('third');
    });

    it('does not call onEach when selectors match no elements', async () => {
      document.body.innerHTML = '<div data-other></div>';
      const onEach = vi.fn();
      const onReady = vi.fn();
      const features = [
        makeLoadable(
          'no-match-each',
          {
            onSetup: () => ({}),
            onEach,
            onReady,
            selectors: ['[data-missing]'],
          },
          { priority: 1 },
        ),
      ];

      await loadFeatures(features);

      expect(onEach).not.toHaveBeenCalled();
    });

    it('warns about circular dependency in a 3-node cycle', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(noop);
      const xSetup = vi.fn();
      const ySetup = vi.fn();
      const zSetup = vi.fn();
      const features = [
        makeLoadable(
          'x',
          { onSetup: xSetup },
          { global: true, priority: 1, dependencies: ['z'], timeout: 100 },
        ),
        makeLoadable(
          'y',
          { onSetup: ySetup },
          { global: true, priority: 2, dependencies: ['x'], timeout: 100 },
        ),
        makeLoadable(
          'z',
          { onSetup: zSetup },
          { global: true, priority: 3, dependencies: ['y'], timeout: 100 },
        ),
      ];

      await loadFeatures(features, { timeout: 100 });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Circular dependency'),
      );
      expect(xSetup).toHaveBeenCalledOnce();
      expect(ySetup).toHaveBeenCalledOnce();
      expect(zSetup).toHaveBeenCalledOnce();
    });

    it('handles invalid CSS selector without crashing other features', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(noop);
      const onSetup = vi.fn();
      const features = [
        makeMeta({
          id: 'bad-selector',
          selectors: ['[invalid===]'],
          priority: 1,
          global: false,
        }),
        makeLoadable('good', { onSetup }, { global: true, priority: 2 }),
      ];

      await loadFeatures(features);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('invalid selector'),
      );
      expect(onSetup).toHaveBeenCalledOnce();
    });

    it('warns about deadlock risk with deps + zero timeout', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(noop);
      const features = [
        makeLoadable(
          'child',
          { onSetup: noop },
          { global: true, priority: 1, dependencies: ['parent'], timeout: 0 },
        ),
        makeLoadable(
          'parent',
          { onSetup: noop },
          { global: true, priority: 2 },
        ),
      ];

      await loadFeatures(features, { timeout: 0 });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('deadlock risk'),
      );
    });
  });

  describe('wave-based concurrent dispatch', () => {
    let warnSpy: MockInstance<typeof console.warn>;
    beforeEach(() => {
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(noop);
    });

    it('runs same-priority features concurrently', async () => {
      let barrierResolve: () => void;
      const barrier = new Promise<void>((r) => {
        barrierResolve = r;
      });
      let slowStarted = false;
      let fastRanWhileSlowWaiting = false;

      const features = [
        makeLoadable(
          'slow',
          {
            onSetup: async () => {
              slowStarted = true;
              await barrier;
            },
          },
          { global: true, priority: 10 },
        ),
        makeLoadable(
          'fast',
          {
            onSetup: () => {
              if (slowStarted) fastRanWhileSlowWaiting = true;
              barrierResolve!();
            },
          },
          { global: true, priority: 10 },
        ),
      ];

      await loadFeatures(features);

      expect(slowStarted).toBe(true);
      expect(fastRanWhileSlowWaiting).toBe(true);
    });

    it('resolves all dependents when multiple features depend on the same feature (same wave)', async () => {
      const order: string[] = [];
      const features = [
        makeLoadable(
          'a',
          {
            onSetup: () => {
              order.push('a');
            },
          },
          { global: true, priority: 10 },
        ),
        makeLoadable(
          'f1',
          {
            onSetup: () => {
              order.push('f1');
            },
          },
          { global: true, priority: 10, dependencies: ['a'] },
        ),
        makeLoadable(
          'f2',
          {
            onSetup: () => {
              order.push('f2');
            },
          },
          { global: true, priority: 10, dependencies: ['a'] },
        ),
        makeLoadable(
          'f3',
          {
            onSetup: () => {
              order.push('f3');
            },
          },
          { global: true, priority: 10, dependencies: ['a'] },
        ),
      ];

      await loadFeatures(features);

      expect(order).toContain('a');
      expect(order).toContain('f1');
      expect(order).toContain('f2');
      expect(order).toContain('f3');
      expect(order.indexOf('a')).toBeLessThan(order.indexOf('f1'));
      expect(order.indexOf('a')).toBeLessThan(order.indexOf('f2'));
      expect(order.indexOf('a')).toBeLessThan(order.indexOf('f3'));
    });

    it('resolves all dependents when multiple features depend on the same feature (cross wave)', async () => {
      const order: string[] = [];
      const features = [
        makeLoadable(
          'a',
          {
            onSetup: () => {
              order.push('a');
            },
          },
          { global: true, priority: 1 },
        ),
        makeLoadable(
          'f1',
          {
            onSetup: () => {
              order.push('f1');
            },
          },
          { global: true, priority: 5, dependencies: ['a'] },
        ),
        makeLoadable(
          'f2',
          {
            onSetup: () => {
              order.push('f2');
            },
          },
          { global: true, priority: 5, dependencies: ['a'] },
        ),
        makeLoadable(
          'f3',
          {
            onSetup: () => {
              order.push('f3');
            },
          },
          { global: true, priority: 5, dependencies: ['a'] },
        ),
      ];

      await loadFeatures(features);

      expect(order[0]).toBe('a');
      expect(order).toContain('f1');
      expect(order).toContain('f2');
      expect(order).toContain('f3');
    });

    it('promotes feature to later wave when it depends on a higher-priority feature', async () => {
      const order: string[] = [];
      const features = [
        makeLoadable(
          'early',
          {
            onSetup: () => {
              order.push('early');
            },
          },
          { global: true, priority: 1, dependencies: ['late'] },
        ),
        makeLoadable(
          'late',
          {
            onSetup: () => {
              order.push('late');
            },
          },
          { global: true, priority: 25 },
        ),
      ];

      await loadFeatures(features);

      expect(order).toEqual(['late', 'early']);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('promoted from priority 1 to wave 25'),
      );
    });

    it('resolves diamond dependency across waves', async () => {
      const order: string[] = [];
      const features = [
        makeLoadable(
          'd',
          {
            onSetup: () => {
              order.push('d');
            },
          },
          { global: true, priority: 1 },
        ),
        makeLoadable(
          'b',
          {
            onSetup: () => {
              order.push('b');
            },
          },
          { global: true, priority: 5, dependencies: ['d'] },
        ),
        makeLoadable(
          'c',
          {
            onSetup: () => {
              order.push('c');
            },
          },
          { global: true, priority: 5, dependencies: ['d'] },
        ),
        makeLoadable(
          'a',
          {
            onSetup: () => {
              order.push('a');
            },
          },
          { global: true, priority: 10, dependencies: ['b', 'c'] },
        ),
      ];

      await loadFeatures(features);

      expect(order[0]).toBe('d');
      expect(order).toContain('b');
      expect(order).toContain('c');
      expect(order[order.length - 1]).toBe('a');
      const bIdx = order.indexOf('b');
      const cIdx = order.indexOf('c');
      const aIdx = order.indexOf('a');
      expect(bIdx).toBeLessThan(aIdx);
      expect(cIdx).toBeLessThan(aIdx);
    });

    it('executes waves sequentially with numeric sort (p=2 before p=10)', async () => {
      const order: string[] = [];
      const features = [
        makeLoadable(
          'ten',
          {
            onSetup: () => {
              order.push('ten');
            },
          },
          { global: true, priority: 10 },
        ),
        makeLoadable(
          'two',
          {
            onSetup: () => {
              order.push('two');
            },
          },
          { global: true, priority: 2 },
        ),
      ];

      await loadFeatures(features);

      expect(order).toEqual(['two', 'ten']);
    });

    it('completes circular pair and dependents without timeout', async () => {
      const aSetup = vi.fn();
      const bSetup = vi.fn();
      const cSetup = vi.fn();
      const features = [
        makeLoadable(
          'a',
          { onSetup: aSetup },
          { global: true, priority: 1, dependencies: ['b'], timeout: 0 },
        ),
        makeLoadable(
          'b',
          { onSetup: bSetup },
          { global: true, priority: 1, dependencies: ['a'], timeout: 0 },
        ),
        makeLoadable(
          'c',
          { onSetup: cSetup },
          { global: true, priority: 2, dependencies: ['a'] },
        ),
      ];

      await loadFeatures(features, { timeout: 0 });

      expect(aSetup).toHaveBeenCalledOnce();
      expect(bSetup).toHaveBeenCalledOnce();
      expect(cSetup).toHaveBeenCalledOnce();
    });

    it('unblocks dependent when feature is disabled (enabled: false)', async () => {
      const onSetup = vi.fn();
      const features = [
        makeLoadable(
          'disabled-feat',
          { enabled: false, onSetup: noop },
          { global: true, priority: 1 },
        ),
        makeLoadable(
          'dependent',
          { onSetup },
          { global: true, priority: 2, dependencies: ['disabled-feat'] },
        ),
      ];

      await loadFeatures(features);

      expect(onSetup).toHaveBeenCalledOnce();
    });

    it('unblocks dependent when onSetup returns false (abort)', async () => {
      const onSetup = vi.fn();
      const features = [
        makeLoadable(
          'aborted-feat',
          { onSetup: () => false },
          { global: true, priority: 1 },
        ),
        makeLoadable(
          'dependent',
          { onSetup },
          { global: true, priority: 2, dependencies: ['aborted-feat'] },
        ),
      ];

      await loadFeatures(features);

      expect(onSetup).toHaveBeenCalledOnce();
    });

    it('warns and ignores self-dependency', async () => {
      const onSetup = vi.fn();
      const features = [
        makeLoadable(
          'self-dep',
          { onSetup },
          { global: true, priority: 1, dependencies: ['self-dep'] },
        ),
      ];

      await loadFeatures(features);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('depends on itself'),
      );
      expect(onSetup).toHaveBeenCalledOnce();
    });

    it('cascades promotion across 3 levels', async () => {
      const order: string[] = [];
      const features = [
        makeLoadable(
          'a',
          {
            onSetup: () => {
              order.push('a');
            },
          },
          { global: true, priority: 1, dependencies: ['b'] },
        ),
        makeLoadable(
          'b',
          {
            onSetup: () => {
              order.push('b');
            },
          },
          { global: true, priority: 5, dependencies: ['c'] },
        ),
        makeLoadable(
          'c',
          {
            onSetup: () => {
              order.push('c');
            },
          },
          { global: true, priority: 10 },
        ),
      ];

      await loadFeatures(features);

      expect(order).toEqual(['c', 'b', 'a']);
      const promotionWarnings = warnSpy.mock.calls.filter(
        (c) =>
          typeof c[0] === 'string' && c[0].includes('promoted from priority'),
      );
      expect(promotionWarnings).toHaveLength(2);
    });

    it('3-node cycle completes without relying on timeout', async () => {
      const xSetup = vi.fn();
      const ySetup = vi.fn();
      const zSetup = vi.fn();
      const features = [
        makeLoadable(
          'x',
          { onSetup: xSetup },
          { global: true, priority: 1, dependencies: ['z'], timeout: 0 },
        ),
        makeLoadable(
          'y',
          { onSetup: ySetup },
          { global: true, priority: 2, dependencies: ['x'], timeout: 0 },
        ),
        makeLoadable(
          'z',
          { onSetup: zSetup },
          { global: true, priority: 3, dependencies: ['y'], timeout: 0 },
        ),
      ];

      await loadFeatures(features, { timeout: 0 });

      expect(xSetup).toHaveBeenCalledOnce();
      expect(ySetup).toHaveBeenCalledOnce();
      expect(zSetup).toHaveBeenCalledOnce();
    });

    it('does not run onReady after timeout fires during onSetup', async () => {
      const onReady = vi.fn();
      const features = [
        makeLoadable(
          'slow',
          {
            onSetup: () => new Promise((resolve) => setTimeout(resolve, 200)),
            onReady,
          },
          { global: true, priority: 1, timeout: 50 },
        ),
      ];

      await loadFeatures(features);

      await new Promise((r) => setTimeout(r, 250));
      expect(onReady).not.toHaveBeenCalled();
    });

    it('does not run remaining onEach or onReady after timeout fires mid-loop', async () => {
      document.body.innerHTML =
        '<div data-t></div><div data-t></div><div data-t></div>';
      const onEach = vi.fn(
        () => new Promise<void>((resolve) => setTimeout(resolve, 100)),
      );
      const onReady = vi.fn();
      const features = [
        makeLoadable(
          'slow-each',
          {
            onSetup: noop,
            onEach,
            onReady,
            selectors: ['[data-t]'],
          },
          { priority: 1, timeout: 50 },
        ),
      ];

      await loadFeatures(features);

      await new Promise((r) => setTimeout(r, 350));
      expect(onEach.mock.calls.length).toBeLessThanOrEqual(1);
      expect(onReady).not.toHaveBeenCalled();
    });

    it('does not run onSetup after timeout fires during dep wait', async () => {
      const onSetup = vi.fn();
      const features = [
        makeLoadable(
          'blocker',
          {
            onSetup: () => new Promise((resolve) => setTimeout(resolve, 200)),
          },
          { global: true, priority: 1 },
        ),
        makeLoadable(
          'waiter',
          {
            onSetup,
          },
          { global: true, priority: 1, dependencies: ['blocker'], timeout: 50 },
        ),
      ];

      await loadFeatures(features);

      await new Promise((r) => setTimeout(r, 250));
      expect(onSetup).not.toHaveBeenCalled();
    });

    it('pruned circular dep does not affect non-circular deps', async () => {
      const order: string[] = [];
      const features = [
        makeLoadable(
          'a',
          {
            onSetup: () => {
              order.push('a');
            },
          },
          { global: true, priority: 1, dependencies: ['b', 'c'] },
        ),
        makeLoadable(
          'b',
          {
            onSetup: () => {
              order.push('b');
            },
          },
          { global: true, priority: 2, dependencies: ['a'] },
        ),
        makeLoadable(
          'c',
          {
            onSetup: () => {
              order.push('c');
            },
          },
          { global: true, priority: 3 },
        ),
      ];

      await loadFeatures(features, { timeout: 0 });

      expect(order).toContain('a');
      expect(order).toContain('b');
      expect(order).toContain('c');
      expect(order.indexOf('c')).toBeLessThan(order.indexOf('a'));
    });
  });
});

describe('loadFeatures — expose + deps (#36)', () => {
  let warnSpy: MockInstance<typeof console.warn>;

  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(noop);
  });

  it("passes only direct dependencies' exposed values to onSetup (AC-1, AC-7)", async () => {
    let seenDeps: Record<string, unknown> | undefined;
    const features = [
      makeLoadable(
        'producer',
        { onSetup: () => ({ token: 'abc' }), expose: (ctx) => ctx },
        { global: true, priority: 1 },
      ),
      makeLoadable(
        'unrelated',
        { onSetup: () => 'x', expose: () => 'unrelated-value' },
        { global: true, priority: 1 },
      ),
      makeLoadable(
        'consumer',
        {
          onSetup: (_s, { deps }) => {
            seenDeps = deps;
          },
        },
        { global: true, priority: 2, dependencies: ['producer'] },
      ),
    ];

    await loadFeatures(features);

    // AC-7: the value was already present when consumer's onSetup ran (captured inside it).
    expect(seenDeps).toEqual({ producer: { token: 'abc' } });
    // AC-1: only the directly-declared dependency appears.
    expect(Object.keys(seenDeps!)).toEqual(['producer']);
  });

  it('exposes only direct deps, not transitive ones, in an A→B→C chain (AC-1)', async () => {
    let bDeps: Record<string, unknown> | undefined;
    let cDeps: Record<string, unknown> | undefined;
    const features = [
      makeLoadable(
        'a',
        { onSetup: () => 'a-value', expose: (ctx) => ctx },
        { global: true, priority: 1 },
      ),
      makeLoadable(
        'b',
        {
          onSetup: (_s, { deps }) => {
            bDeps = deps;
            return 'b-value';
          },
          expose: () => 'b-value',
        },
        { global: true, priority: 2, dependencies: ['a'] },
      ),
      makeLoadable(
        'c',
        {
          onSetup: (_s, { deps }) => {
            cDeps = deps;
          },
        },
        { global: true, priority: 3, dependencies: ['b'] },
      ),
    ];

    await loadFeatures(features);

    // B sees A (its direct dep).
    expect(bDeps).toEqual({ a: 'a-value' });
    // C declares a dep on B only, so it sees B's exposed value — but never A's (transitive).
    expect(Object.keys(cDeps!)).toEqual(['b']);
    expect(cDeps).toEqual({ b: 'b-value' });
    expect(cDeps!).not.toHaveProperty('a');
  });

  it('produces undefined for a dependency that defines no expose (AC-2)', async () => {
    let seenDeps: Record<string, unknown> | undefined;
    const features = [
      makeLoadable(
        'producer',
        { onSetup: () => ({ token: 'abc' }) }, // no expose
        { global: true, priority: 1 },
      ),
      makeLoadable(
        'consumer',
        {
          onSetup: (_s, { deps }) => {
            seenDeps = deps;
          },
        },
        { global: true, priority: 2, dependencies: ['producer'] },
      ),
    ];

    await loadFeatures(features);

    expect(Object.keys(seenDeps!)).toContain('producer');
    expect(seenDeps!.producer).toBeUndefined();
  });

  it('does not call expose when onSetup returns false (AC-3)', async () => {
    const expose = vi.fn(() => 'should-not-be-stored');
    let seenDeps: Record<string, unknown> | undefined;
    const features = [
      makeLoadable(
        'producer',
        { onSetup: () => false, expose },
        { global: true, priority: 1 },
      ),
      makeLoadable(
        'consumer',
        {
          onSetup: (_s, { deps }) => {
            seenDeps = deps;
          },
        },
        { global: true, priority: 2, dependencies: ['producer'] },
      ),
    ];

    await loadFeatures(features);

    expect(expose).not.toHaveBeenCalled();
    expect(seenDeps!.producer).toBeUndefined();
  });

  it('skips dependents when a dependency fails (AC-4)', async () => {
    const consumerSetup = vi.fn();
    const features = [
      makeLoadable(
        'producer',
        {
          onSetup: () => {
            throw new Error('setup failed');
          },
          expose: () => 'v',
        },
        { global: true, priority: 1, timeout: 100 },
      ),
      makeLoadable(
        'consumer',
        { onSetup: consumerSetup },
        { global: true, priority: 2, dependencies: ['producer'], timeout: 100 },
      ),
    ];

    await loadFeatures(features);

    expect(consumerSetup).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('dependency "producer" failed'),
    );
  });

  it('treats a feature whose expose throws as failed and skips its dependents (AC-5)', async () => {
    const consumerSetup = vi.fn();
    const features = [
      makeLoadable(
        'producer',
        {
          onSetup: () => ({}),
          expose: () => {
            throw new Error('expose boom');
          },
        },
        { global: true, priority: 1, timeout: 100 },
      ),
      makeLoadable(
        'consumer',
        { onSetup: consumerSetup },
        { global: true, priority: 2, dependencies: ['producer'], timeout: 100 },
      ),
    ];

    await loadFeatures(features);

    expect(consumerSetup).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('dependency "producer" failed'),
    );
  });

  it('calls expose with undefined when there is no onSetup (AC-6)', async () => {
    const expose = vi.fn(() => 'exposed-without-setup');
    let seenDeps: Record<string, unknown> | undefined;
    const features = [
      makeLoadable(
        'producer',
        { expose }, // no onSetup, no onEach
        { global: true, priority: 1 },
      ),
      makeLoadable(
        'consumer',
        {
          onSetup: (_s, { deps }) => {
            seenDeps = deps;
          },
        },
        { global: true, priority: 2, dependencies: ['producer'] },
      ),
    ];

    await loadFeatures(features);

    expect(expose).toHaveBeenCalledWith(undefined);
    expect(seenDeps!.producer).toBe('exposed-without-setup');
  });

  it('awaits an async expose and stores the resolved value, not the Promise (AC-9)', async () => {
    let seenDeps: Record<string, unknown> | undefined;
    const features = [
      makeLoadable(
        'producer',
        { onSetup: () => ({}), expose: async () => 'resolved-value' },
        { global: true, priority: 1 },
      ),
      makeLoadable(
        'consumer',
        {
          onSetup: (_s, { deps }) => {
            seenDeps = deps;
          },
        },
        { global: true, priority: 2, dependencies: ['producer'] },
      ),
    ];

    await loadFeatures(features);

    expect(seenDeps!.producer).toBe('resolved-value');
  });

  it('serves the same exposed value to multiple dependents (AC-10)', async () => {
    const value = { version: 1 };
    let depsB: Record<string, unknown> | undefined;
    let depsC: Record<string, unknown> | undefined;
    const features = [
      makeLoadable(
        'a',
        { onSetup: () => value, expose: (ctx) => ctx },
        { global: true, priority: 1 },
      ),
      makeLoadable(
        'b',
        {
          onSetup: (_s, { deps }) => {
            depsB = deps;
          },
        },
        { global: true, priority: 2, dependencies: ['a'] },
      ),
      makeLoadable(
        'c',
        {
          onSetup: (_s, { deps }) => {
            depsC = deps;
          },
        },
        { global: true, priority: 2, dependencies: ['a'] },
      ),
    ];

    await loadFeatures(features);

    expect(depsB!.a).toBe(value);
    expect(depsC!.a).toBe(value);
    expect(depsB!.a).toBe(depsC!.a);
  });

  it('does not call expose for a disabled feature; dependents get undefined (AC-11)', async () => {
    const expose = vi.fn(() => 'should-not-run');
    let seenDeps: Record<string, unknown> | undefined;
    const features = [
      makeLoadable(
        'producer',
        { onSetup: () => ({}), expose, enabled: false },
        { global: true, priority: 1 },
      ),
      makeLoadable(
        'consumer',
        {
          onSetup: (_s, { deps }) => {
            seenDeps = deps;
          },
        },
        { global: true, priority: 2, dependencies: ['producer'] },
      ),
    ];

    await loadFeatures(features);

    expect(expose).not.toHaveBeenCalled();
    expect(seenDeps!.producer).toBeUndefined();
  });

  it('stores false/null exposed values verbatim (edge: not an opt-out)', async () => {
    let depsFalse: Record<string, unknown> | undefined;
    let depsNull: Record<string, unknown> | undefined;
    const features = [
      makeLoadable(
        'pf',
        { onSetup: () => ({}), expose: () => false },
        { global: true, priority: 1 },
      ),
      makeLoadable(
        'pn',
        { onSetup: () => ({}), expose: () => null },
        { global: true, priority: 1 },
      ),
      makeLoadable(
        'cf',
        {
          onSetup: (_s, { deps }) => {
            depsFalse = deps;
          },
        },
        { global: true, priority: 2, dependencies: ['pf'] },
      ),
      makeLoadable(
        'cn',
        {
          onSetup: (_s, { deps }) => {
            depsNull = deps;
          },
        },
        { global: true, priority: 2, dependencies: ['pn'] },
      ),
    ];

    await loadFeatures(features);

    expect(depsFalse!.pf).toBe(false);
    expect(depsNull!.pn).toBeNull();
  });

  it('omits the pruned edge from deps for a circular dependency (edge 11)', async () => {
    let depsA: Record<string, unknown> | undefined;
    let depsB: Record<string, unknown> | undefined;
    const features = [
      makeLoadable(
        'a',
        {
          onSetup: (_s, { deps }) => {
            depsA = deps;
            return {};
          },
          expose: (ctx) => ctx,
        },
        { global: true, priority: 1, dependencies: ['b'] },
      ),
      makeLoadable(
        'b',
        {
          onSetup: (_s, { deps }) => {
            depsB = deps;
            return {};
          },
          expose: (ctx) => ctx,
        },
        { global: true, priority: 2, dependencies: ['a'] },
      ),
    ];

    await loadFeatures(features);

    // `a` is visited first (lower priority), so the `b->a` edge is pruned:
    // `b` sees no key for the pruned `a`, while `a`'s surviving edge to `b` is present.
    expect(Object.keys(depsB!)).not.toContain('a');
    expect(Object.keys(depsA!)).toContain('b');
  });

  it('delivers the exposed value across the gate when producer and consumer share a wave (AC-7)', async () => {
    const value = { ready: true };
    let seenValue: unknown = 'not-set';
    const features = [
      // Same priority → same wave → both run concurrently in one allSettled batch.
      // The consumer is gated on the producer; this is the only shape that actually
      // exercises store-before-markReady (cross-wave tests pass trivially).
      makeLoadable(
        'producer',
        { onSetup: () => value, expose: (ctx) => ctx },
        { global: true, priority: 1 },
      ),
      makeLoadable(
        'consumer',
        {
          onSetup: (_s, { deps }) => {
            seenValue = deps['producer'];
          },
        },
        { global: true, priority: 1, dependencies: ['producer'] },
      ),
    ];

    await loadFeatures(features);

    expect(seenValue).toBe(value);
  });

  it('treats an async expose rejection as failure and skips dependents (AC-5, async)', async () => {
    const consumerSetup = vi.fn();
    const features = [
      makeLoadable(
        'producer',
        {
          onSetup: () => ({}),
          expose: async () => {
            throw new Error('async expose boom');
          },
        },
        { global: true, priority: 1, timeout: 100 },
      ),
      makeLoadable(
        'consumer',
        { onSetup: consumerSetup },
        { global: true, priority: 2, dependencies: ['producer'], timeout: 100 },
      ),
    ];

    await loadFeatures(features);

    expect(consumerSetup).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('dependency "producer" failed'),
    );
  });

  it('passes an empty deps record to a feature with no dependencies', async () => {
    let seenDeps: Record<string, unknown> | undefined;
    const features = [
      makeLoadable(
        'solo',
        {
          onSetup: (_s, { deps }) => {
            seenDeps = deps;
          },
        },
        { global: true, priority: 1 },
      ),
    ];

    await loadFeatures(features);

    expect(seenDeps).toEqual({});
    expect(Object.keys(seenDeps!)).toHaveLength(0);
  });

  it("delivers the exposed value when a dependent is promoted to its dependency's wave (AC-7, promotion)", async () => {
    // The dependent declares a LOWER priority number than its dependency, so the loader
    // promotes it from wave 1 to the dependency's wave (2) — both then run gated in the same
    // wave. Verifies the exposed value still reaches the dependent after promotion.
    const value = { promoted: true };
    let seenValue: unknown = 'not-set';
    const features = [
      makeLoadable(
        'consumer',
        {
          onSetup: (_s, { deps }) => {
            seenValue = deps['producer'];
          },
        },
        { global: true, priority: 1, dependencies: ['producer'] },
      ),
      makeLoadable(
        'producer',
        { onSetup: () => value, expose: (ctx) => ctx },
        { global: true, priority: 2 },
      ),
    ];

    await loadFeatures(features);

    expect(seenValue).toBe(value);
  });
});

// End-to-end tests through the REAL defineFeature → loadFeatures path (#38). Unlike the #36 block
// (which builds descriptors directly), these prove the freeze pass-through carries `expose` through
// defineFeature into the loader.
describe('loadFeatures — expose + deps integration (#38)', () => {
  let warnSpy: MockInstance<typeof console.warn>;

  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(noop);
  });

  it("passes a dependency's exposed value to the dependent via deps (AC-1)", async () => {
    let seenDeps: Record<string, unknown> | undefined;
    const features = [
      defineLoadable({
        id: 'producer',
        selectors: [],
        priority: 1,
        global: true,
        onSetup: () => ({ token: 'abc' }),
        expose: (ctx) => ctx,
      }),
      defineLoadable({
        id: 'consumer',
        selectors: [],
        priority: 2,
        global: true,
        dependencies: ['producer'],
        onSetup: (_s, { deps }) => {
          seenDeps = deps;
        },
      }),
    ];

    await loadFeatures(features);

    expect(seenDeps).toEqual({ producer: { token: 'abc' } });
  });

  it('produces undefined in deps for a dependency without expose (AC-2)', async () => {
    let seenDeps: Record<string, unknown> | undefined;
    const features = [
      defineLoadable({
        id: 'producer',
        selectors: [],
        priority: 1,
        global: true,
        onSetup: () => ({ token: 'abc' }),
      }),
      defineLoadable({
        id: 'consumer',
        selectors: [],
        priority: 2,
        global: true,
        dependencies: ['producer'],
        onSetup: (_s, { deps }) => {
          seenDeps = deps;
        },
      }),
    ];

    await loadFeatures(features);

    expect(Object.keys(seenDeps!)).toContain('producer');
    expect(seenDeps!.producer).toBeUndefined();
  });

  it('does not call expose when onSetup returns false (AC-3)', async () => {
    const expose = vi.fn(() => 'should-not-store');
    let seenDeps: Record<string, unknown> | undefined;
    const features = [
      defineLoadable({
        id: 'producer',
        selectors: [],
        priority: 1,
        global: true,
        onSetup: () => false,
        expose,
      }),
      defineLoadable({
        id: 'consumer',
        selectors: [],
        priority: 2,
        global: true,
        dependencies: ['producer'],
        onSetup: (_s, { deps }) => {
          seenDeps = deps;
        },
      }),
    ];

    await loadFeatures(features);

    expect(expose).not.toHaveBeenCalled();
    expect(Object.keys(seenDeps!)).toContain('producer');
    expect(seenDeps!.producer).toBeUndefined();
  });

  it('skips a dependent when its dependency fails (AC-4)', async () => {
    const consumerSetup = vi.fn();
    const features = [
      defineLoadable({
        id: 'producer',
        selectors: [],
        priority: 1,
        global: true,
        onSetup: () => {
          throw new Error('setup failed');
        },
      }),
      defineLoadable({
        id: 'consumer',
        selectors: [],
        priority: 2,
        global: true,
        dependencies: ['producer'],
        onSetup: consumerSetup,
      }),
    ];

    await loadFeatures(features);

    expect(consumerSetup).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('dependency "producer" failed'),
    );
  });

  it('prunes a circular dependency and still runs both features (AC-5)', async () => {
    const order: string[] = [];
    const features = [
      defineLoadable({
        id: 'a',
        selectors: [],
        priority: 1,
        global: true,
        dependencies: ['b'],
        onSetup: () => {
          order.push('a');
        },
      }),
      defineLoadable({
        id: 'b',
        selectors: [],
        priority: 2,
        global: true,
        dependencies: ['a'],
        onSetup: () => {
          order.push('b');
        },
      }),
    ];

    await loadFeatures(features);

    expect(order).toContain('a');
    expect(order).toContain('b');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Circular dependency'),
    );
  });

  it('exposes only direct dependencies, not transitive ones (AC-6)', async () => {
    let seenDepsB: Record<string, unknown> | undefined;
    let seenDepsC: Record<string, unknown> | undefined;
    const features = [
      defineLoadable({
        id: 'a',
        selectors: [],
        priority: 1,
        global: true,
        onSetup: () => 'value-a',
        expose: (ctx) => ctx,
      }),
      defineLoadable({
        id: 'b',
        selectors: [],
        priority: 2,
        global: true,
        dependencies: ['a'],
        // Reads its own direct dep so the A→B leg is load-bearing (not a hardcoded return).
        onSetup: (_s, { deps }) => {
          seenDepsB = deps;
          return 'value-b';
        },
        expose: (ctx) => ctx,
      }),
      defineLoadable({
        id: 'c',
        selectors: [],
        priority: 3,
        global: true,
        dependencies: ['b'],
        onSetup: (_s, { deps }) => {
          seenDepsC = deps;
        },
      }),
    ];

    await loadFeatures(features);

    // A→B: B's direct dep `a` carries A's exposed value (the chain actually delivers).
    expect(Object.keys(seenDepsB!)).toEqual(['a']);
    expect(seenDepsB!.a).toBe('value-a');
    // B→C: C declares only `b` → its deps has `b` and NOT the transitive `a`.
    expect(Object.keys(seenDepsC!)).toEqual(['b']);
    expect(seenDepsC!.b).toBe('value-b');
  });

  it('treats a feature whose expose throws as failed and skips dependents (AC-7)', async () => {
    const consumerSetup = vi.fn();
    const features = [
      defineLoadable({
        id: 'producer',
        selectors: [],
        priority: 1,
        global: true,
        onSetup: () => ({}),
        expose: () => {
          throw new Error('expose boom');
        },
      }),
      defineLoadable({
        id: 'consumer',
        selectors: [],
        priority: 2,
        global: true,
        dependencies: ['producer'],
        onSetup: consumerSetup,
      }),
    ];

    await loadFeatures(features);

    expect(consumerSetup).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('dependency "producer" failed'),
    );
  });

  it('delivers the exposed value when producer and consumer share a wave (AC-1, same-wave)', async () => {
    // Both at priority 1 → same wave → gated, concurrent. This is the only #38 shape that
    // exercises store-before-markReady through the real defineFeature seam (the cross-wave
    // tests above satisfy ordering trivially because wave 1 fully settles before wave 2).
    const value = { ready: true };
    let seenValue: unknown = 'not-set';
    const features = [
      defineLoadable({
        id: 'producer',
        selectors: [],
        priority: 1,
        global: true,
        onSetup: () => value,
        expose: (ctx) => ctx,
      }),
      defineLoadable({
        id: 'consumer',
        selectors: [],
        priority: 1,
        global: true,
        dependencies: ['producer'],
        onSetup: (_s, { deps }) => {
          seenValue = deps['producer'];
        },
      }),
    ];

    await loadFeatures(features);

    expect(seenValue).toBe(value);
  });

  it('runs a plain feature (no expose/deps) through its full lifecycle unaffected (AC-8)', async () => {
    document.body.innerHTML = '<div data-plain></div><div data-plain></div>';
    const order: string[] = [];
    const features = [
      defineLoadable({
        id: 'plain',
        selectors: ['[data-plain]'],
        priority: 1,
        onSetup: () => {
          order.push('setup');
          return { n: 1 };
        },
        onEach: ({ ctx }) => {
          order.push(`each:${(ctx as { n: number }).n}`);
        },
        onReady: () => {
          order.push('ready');
        },
      }),
    ];

    await loadFeatures(features);

    expect(order).toEqual(['setup', 'each:1', 'each:1', 'ready']);
  });
});

describe('loadFeatures — root option (#135)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('AC-1: passes document as the root when the root option is omitted', async () => {
    document.body.innerHTML = '<div data-a></div>';
    let seenRoot: unknown;
    const features = [
      makeLoadable('a', {
        selectors: ['[data-a]'],
        onSetup: (_selectors, { root }) => {
          seenRoot = root;
        },
      }),
    ];

    await loadFeatures(features);

    expect(seenRoot).toBe(document);
  });

  it('AC-2: matches a non-global feature only when a selector matches a descendant of root', async () => {
    document.body.innerHTML =
      '<div id="container"><div data-in></div></div><div data-out></div>';
    const root = document.getElementById('container')!;
    const inSetup = vi.fn();
    const outSetup = vi.fn();
    const features = [
      makeLoadable('in', { selectors: ['[data-in]'], onSetup: inSetup }),
      makeLoadable('out', { selectors: ['[data-out]'], onSetup: outSetup }),
    ];

    await loadFeatures(features, { root });

    expect(inSetup).toHaveBeenCalledOnce();
    expect(outSetup).not.toHaveBeenCalled();
  });

  it('AC-3: passes only descendants of root to onEach', async () => {
    document.body.innerHTML =
      '<div id="container"><div data-item id="inside"></div></div><div data-item id="outside"></div>';
    const root = document.getElementById('container')!;
    const seenIds: string[] = [];
    const features = [
      makeLoadable('items', {
        selectors: ['[data-item]'],
        onEach: ({ el }) => {
          seenIds.push(el.id);
        },
      }),
    ];

    await loadFeatures(features, { root });

    expect(seenIds).toEqual(['inside']);
  });

  it('AC-4: does not match a feature whose selector matches only the root element itself', async () => {
    document.body.innerHTML = '<div id="container" data-self></div>';
    const root = document.getElementById('container')!;
    const onSetup = vi.fn();
    const features = [
      makeLoadable('self', { selectors: ['[data-self]'], onSetup }),
    ];

    await loadFeatures(features, { root });

    expect(onSetup).not.toHaveBeenCalled();
  });

  it('AC-5: skips an invalid selector with the [loader] warn and keeps evaluating the rest under a custom root', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(noop);
    document.body.innerHTML = '<div id="container"><div data-ok></div></div>';
    const root = document.getElementById('container')!;
    const onSetup = vi.fn();
    const features = [
      makeLoadable('mixed', {
        selectors: ['[invalid===]', '[data-ok]'],
        onSetup,
      }),
    ];

    await loadFeatures(features, { root });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[loader] Feature "mixed" has invalid selector'),
    );
    expect(onSetup).toHaveBeenCalledOnce();
  });

  it('AC-6: passes the custom root to onSetup for global and non-global features', async () => {
    document.body.innerHTML = '<div id="container"><div data-a></div></div>';
    const root = document.getElementById('container')!;
    const seen: Record<string, unknown> = {};
    const features = [
      makeLoadable('local', {
        selectors: ['[data-a]'],
        onSetup: (_selectors, context) => {
          seen.local = context.root;
        },
      }),
      makeLoadable(
        'glob',
        {
          global: true,
          onSetup: (_selectors, context) => {
            seen.glob = context.root;
          },
        },
        { global: true },
      ),
    ];

    await loadFeatures(features, { root });

    expect(seen.local).toBe(root);
    expect(seen.glob).toBe(root);
  });

  it('AC-7: passes the custom root in the context of every onEach call', async () => {
    document.body.innerHTML =
      '<div id="container"><div data-item></div><div data-item></div></div>';
    const root = document.getElementById('container')!;
    const seenRoots: unknown[] = [];
    const features = [
      makeLoadable('items', {
        selectors: ['[data-item]'],
        onEach: (context) => {
          seenRoots.push(context.root);
        },
      }),
    ];

    await loadFeatures(features, { root });

    expect(seenRoots).toHaveLength(2);
    expect(seenRoots.every((r) => r === root)).toBe(true);
  });

  it('AC-8: passes document to onSetup and onEach and scans the whole document when root is omitted', async () => {
    document.body.innerHTML =
      '<div id="container"><div data-item></div></div><div data-item></div>';
    let setupRoot: unknown;
    const eachRoots: unknown[] = [];
    const features = [
      makeLoadable('items', {
        selectors: ['[data-item]'],
        onSetup: (_selectors, context) => {
          setupRoot = context.root;
        },
        onEach: (context) => {
          eachRoots.push(context.root);
        },
      }),
    ];

    await loadFeatures(features);

    expect(setupRoot).toBe(document);
    expect(eachRoots).toEqual([document, document]);
  });

  it('AC-9: matches no non-global feature and does not throw when root is detached', async () => {
    document.body.innerHTML = '<div data-a></div>';
    const root = document.createElement('div');
    const onSetup = vi.fn();
    const features = [makeLoadable('a', { selectors: ['[data-a]'], onSetup })];

    await expect(loadFeatures(features, { root })).resolves.toBeUndefined();

    expect(onSetup).not.toHaveBeenCalled();
  });

  it('AC-10: always matches global features regardless of root', async () => {
    const root = document.createElement('div');
    const onSetup = vi.fn();
    const features = [
      makeLoadable('glob', { global: true, onSetup }, { global: true }),
    ];

    await loadFeatures(features, { root });

    expect(onSetup).toHaveBeenCalledOnce();
  });
});

describe('loadFeatures — AbortSignal in hooks (#136)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(noop);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('AC-1: passes an AbortSignal in the onSetup context for global and non-global features', async () => {
    document.body.innerHTML = '<div class="a"></div>';
    const seen: { local?: unknown; glob?: unknown } = {};
    const features = [
      makeLoadable('local', {
        selectors: ['.a'],
        onSetup: (_s, context) => {
          seen.local = context.signal;
        },
      }),
      makeLoadable(
        'glob',
        {
          global: true,
          onSetup: (_s, context) => {
            seen.glob = context.signal;
          },
        },
        { global: true },
      ),
    ];

    await loadFeatures(features);

    expect(seen.local).toBeInstanceOf(AbortSignal);
    expect(seen.glob).toBeInstanceOf(AbortSignal);
  });

  it('AC-2: passes an AbortSignal in the context of every onEach call', async () => {
    document.body.innerHTML = '<div class="a"></div><div class="a"></div>';
    const seen: unknown[] = [];
    const features = [
      makeLoadable('each', {
        selectors: ['.a'],
        onEach: (context) => {
          seen.push(context.signal);
        },
      }),
    ];

    await loadFeatures(features);

    expect(seen).toHaveLength(2);
    expect(seen.every((s) => s instanceof AbortSignal)).toBe(true);
  });

  it('AC-3: calls onReady with { ctx, signal, root } for global and non-global features', async () => {
    document.body.innerHTML =
      '<div id="container"><div class="a"></div><div class="b"></div></div>';
    const root = document.getElementById('container')!;
    const withSetup = vi.fn();
    const withoutSetup = vi.fn();
    const glob = vi.fn();
    const features = [
      makeLoadable('with-setup', {
        selectors: ['.a'],
        onSetup: () => ({ token: 'abc' }),
        onReady: withSetup,
      }),
      makeLoadable('without-setup', {
        selectors: ['.b'],
        onReady: withoutSetup,
      }),
      makeLoadable(
        'glob',
        { global: true, onSetup: () => 42, onReady: glob },
        { global: true },
      ),
    ];

    await loadFeatures(features, { root });

    expect(withSetup).toHaveBeenCalledWith({
      ctx: { token: 'abc' },
      signal: expect.any(AbortSignal),
      root,
    });
    expect(withoutSetup).toHaveBeenCalledWith({
      ctx: undefined,
      signal: expect.any(AbortSignal),
      root,
    });
    expect(glob).toHaveBeenCalledWith({
      ctx: 42,
      signal: expect.any(AbortSignal),
      root,
    });
  });

  it('AC-4: hands every hook of a feature the same signal and each feature its own', async () => {
    document.body.innerHTML = '<div class="a"></div><div class="a"></div>';
    const seen: Record<string, AbortSignal[]> = { one: [], two: [] };
    const track = (id: string) => ({
      selectors: ['.a'],
      onSetup: (_s: string[], { signal }: { signal: AbortSignal }) => {
        seen[id]!.push(signal);
      },
      onEach: ({ signal }: { signal: AbortSignal }) => {
        seen[id]!.push(signal);
      },
      onReady: ({ signal }: { signal: AbortSignal }) => {
        seen[id]!.push(signal);
      },
    });
    const features = [
      makeLoadable('one', track('one')),
      makeLoadable('two', track('two')),
    ];

    await loadFeatures(features);

    expect(seen.one).toHaveLength(4);
    expect(new Set(seen.one).size).toBe(1);
    expect(new Set(seen.two).size).toBe(1);
    expect(seen.one![0]).not.toBe(seen.two![0]);
  });

  it('AC-5: aborts the signal the hooks received when the feature times out', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const features = [
      makeLoadable(
        'slow',
        {
          global: true,
          onSetup: (_s, context) => {
            signal = context.signal;
            return new Promise(() => {});
          },
        },
        { global: true, timeout: 50 },
      ),
    ];

    const done = loadFeatures(features);
    while (!signal) await vi.advanceTimersByTimeAsync(0);
    expect(signal.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(50);
    await done;

    expect(signal.aborted).toBe(true);
  });

  it('AC-6: aborts the signal when a hook throws, removing listeners registered with it', async () => {
    document.body.innerHTML = '<div class="a"></div>';
    const listener = vi.fn();
    let signal: AbortSignal | undefined;
    const features = [
      makeLoadable('broken', {
        selectors: ['.a'],
        onSetup: (_s, context) => {
          signal = context.signal;
          window.addEventListener('fe-136', listener, { signal });
        },
        onEach: () => {
          throw new Error('boom');
        },
      }),
    ];

    await loadFeatures(features);
    window.dispatchEvent(new Event('fe-136'));

    expect(signal!.aborted).toBe(true);
    expect(listener).not.toHaveBeenCalled();
  });

  it('AC-6: aborts the signal when expose throws', async () => {
    let signal: AbortSignal | undefined;
    const features = [
      makeLoadable(
        'broken-expose',
        {
          global: true,
          onSetup: (_s, context) => {
            signal = context.signal;
          },
          expose: () => {
            throw new Error('boom');
          },
        },
        { global: true },
      ),
    ];

    await loadFeatures(features);

    expect(signal!.aborted).toBe(true);
  });

  it('AC-7: aborts the signal when onSetup returns false', async () => {
    const onReady = vi.fn();
    let signal: AbortSignal | undefined;
    const features = [
      makeLoadable(
        'opt-out',
        {
          global: true,
          onSetup: (_s, context) => {
            signal = context.signal;
            return false;
          },
          onReady,
        },
        { global: true },
      ),
    ];

    await loadFeatures(features);

    expect(signal!.aborted).toBe(true);
    expect(onReady).not.toHaveBeenCalled();
  });

  it('AC-8: does not abort the signal of a feature that completes, with or without a timeout', async () => {
    vi.useFakeTimers();
    const signals: Record<string, AbortSignal> = {};
    const capture = (id: string, timeout: number | null) =>
      makeLoadable(
        id,
        {
          global: true,
          onSetup: (_s, context) => {
            signals[id] = context.signal;
          },
        },
        { global: true, timeout },
      );
    const features = [capture('timed', 50), capture('untimed', 0)];

    const done = loadFeatures(features);
    await vi.advanceTimersByTimeAsync(0);
    await done;
    await vi.advanceTimersByTimeAsync(100);

    expect(signals.timed!.aborted).toBe(false);
    expect(signals.untimed!.aborted).toBe(false);
  });

  it('AC-9: keeps running a zero-argument onReady and calls expose with only ctx', async () => {
    const order: string[] = [];
    const expose = vi.fn((ctx: unknown) => ctx);
    const features = [
      defineLoadable({
        id: 'legacy',
        selectors: [],
        priority: 0,
        global: true,
        onSetup: () => ({ token: 'abc' }),
        onReady() {
          order.push('ready');
        },
        expose,
      }),
    ];

    await loadFeatures(features);

    expect(order).toEqual(['ready']);
    expect(expose).toHaveBeenCalledWith({ token: 'abc' });
  });
});
