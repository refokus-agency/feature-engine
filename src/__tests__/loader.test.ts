import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadFeatures } from '../loader.ts';
import type { FeatureDescriptor, FeatureMeta } from '../types.ts';

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
  return makeMeta({ id, load: () => Promise.resolve({ default: full }), ...meta });
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
          { selectors: ['[data-hero]'], priority: 1 },
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
            onSetup: () => { order.push('setup'); },
            onEach: () => { order.push('each'); },
            onReady: () => { order.push('ready'); },
            selectors: ['[data-item]'],
          },
          { selectors: ['[data-item]'], global: false, priority: 1 },
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
            onEach: ({ ctx }) => { receivedCtx = ctx; },
            selectors: ['[data-x]'],
          },
          { selectors: ['[data-x]'], priority: 1 },
        ),
      ];

      await loadFeatures(features);

      expect(receivedCtx).toEqual({ magic: 42 });
    });

    it('passes correct { el, index, elements, ctx } shape to onEach', async () => {
      document.body.innerHTML = '<div data-el></div><span data-el></span>';
      const calls: { el: Element; index: number; elements: NodeListOf<Element>; ctx: unknown }[] = [];
      const features = [
        makeLoadable(
          'shape-check',
          {
            onSetup: () => ({ token: 'abc' }),
            onEach: (arg: { el: Element; index: number; elements: NodeListOf<Element>; ctx: unknown }) => {
              calls.push(arg);
            },
            selectors: ['[data-el]'],
          },
          { selectors: ['[data-el]'], priority: 1 },
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
          { selectors: ['[data-r]'], priority: 1 },
        ),
      ];

      await loadFeatures(features);

      expect(onEach).toHaveBeenCalledOnce();
      expect(onReady).toHaveBeenCalledOnce();
    });

    it('sorts features by priority', async () => {
      const order: string[] = [];
      const features = [
        makeLoadable('b', { onSetup: () => { order.push('b'); } }, { global: true, priority: 20 }),
        makeLoadable('a', { onSetup: () => { order.push('a'); } }, { global: true, priority: 10 }),
      ];

      await loadFeatures(features);

      expect(order).toEqual(['a', 'b']);
    });
  });

  describe('dependency ordering (topological sort)', () => {
    it('initializes dependencies before dependents', async () => {
      const order: string[] = [];
      const features = [
        makeLoadable('child', { onSetup: () => { order.push('child'); } }, { global: true, priority: 1, dependencies: ['parent'] }),
        makeLoadable('parent', { onSetup: () => { order.push('parent'); } }, { global: true, priority: 2 }),
      ];

      await loadFeatures(features);

      expect(order).toEqual(['parent', 'child']);
    });

    it('handles circular dependencies without throwing', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(noop);
      const order: string[] = [];
      const features = [
        makeLoadable('a', { onSetup: () => { order.push('a'); } }, { global: true, priority: 1, dependencies: ['b'], timeout: 100 }),
        makeLoadable('b', { onSetup: () => { order.push('b'); } }, { global: true, priority: 2, dependencies: ['a'], timeout: 100 }),
      ];

      await loadFeatures(features, { timeout: 100 });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Circular dependency'),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('failed:'),
        expect.objectContaining({ message: expect.stringContaining('timed out') }),
      );
      expect(order).toContain('a');
    });

    it('resolves a deep 3-level dependency chain in correct order', async () => {
      const order: string[] = [];
      const features = [
        makeLoadable('c', { onSetup: () => { order.push('c'); } }, { global: true, priority: 1, dependencies: ['b'] }),
        makeLoadable('b', { onSetup: () => { order.push('b'); } }, { global: true, priority: 2, dependencies: ['a'] }),
        makeLoadable('a', { onSetup: () => { order.push('a'); } }, { global: true, priority: 3 }),
      ];

      await loadFeatures(features);

      expect(order).toEqual(['a', 'b', 'c']);
    });

    it('warns on unknown dependency and ignores it', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(noop);
      const onSetup = vi.fn();
      const features = [
        makeLoadable('feat', { onSetup }, { global: true, priority: 1, dependencies: ['nonexistent'] }),
      ];

      await loadFeatures(features);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('unknown "nonexistent"'),
      );
      expect(onSetup).toHaveBeenCalledOnce();
    });
  });

  describe('timeout', () => {
    it('rejects a feature that exceeds its timeout', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(noop);
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
        expect.objectContaining({ message: expect.stringContaining('timed out') }),
      );
    });

    it('continues to next feature after timeout (AC-5)', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(noop);
      const nextSetup = vi.fn();
      const features = [
        makeLoadable(
          'slow',
          { onSetup: () => new Promise(() => {}) },
          { global: true, priority: 1, timeout: 50 },
        ),
        makeLoadable('fast', { onSetup: nextSetup }, { global: true, priority: 2 }),
      ];

      await loadFeatures(features);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Feature "slow" failed:'),
        expect.objectContaining({ message: expect.stringContaining('timed out') }),
      );
      expect(nextSetup).toHaveBeenCalledOnce();
    });

    it('uses global timeout when per-feature timeout is null', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(noop);
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
        expect.objectContaining({ message: expect.stringContaining('timed out') }),
      );
    });

    it('does not apply timeout when timeout is 0', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(noop);
      let resolved = false;
      const features = [
        makeLoadable(
          'async-no-timeout',
          { onSetup: () => new Promise((r) => setTimeout(() => { resolved = true; r(undefined); }, 60)) },
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
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(noop);
      const onSetup = vi.fn(() => new Promise((resolve) => setTimeout(resolve, 120)));
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
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(noop);
      const onSetup = vi.fn();
      const features = [
        makeLoadable('feat', { onSetup }, { global: true, priority: 1 }),
      ];

      await loadFeatures(features, { timeout: -500 });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Negative timeout'),
      );
      expect(onSetup).toHaveBeenCalledOnce();
    });
  });

  describe('chunk load failure', () => {
    it('warns and continues when a chunk fails to load', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(noop);
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

    it('unblocks dependent features when a chunk fails to load', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(noop);
      const onSetup = vi.fn();
      const features: FeatureMeta[] = [
        makeMeta({
          id: 'broken',
          global: true,
          priority: 1,
          load: () => Promise.reject(new Error('network error')),
        }),
        makeLoadable('dependent', { onSetup }, { global: true, priority: 2, dependencies: ['broken'] }),
      ];

      await loadFeatures(features);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load feature "broken"'),
        expect.any(Error),
      );
      expect(onSetup).toHaveBeenCalledOnce();
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
          { selectors: ['[data-x]'], priority: 1 },
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
      const unmatched = makeMeta({ id: 'unmatched', selectors: ['[data-gone]'], priority: 1 });
      const dependent = makeLoadable(
        'dependent',
        { onSetup: () => { order.push('dependent'); } },
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
            onEach: ({ ctx }: { ctx: unknown }) => { receivedCtx = ctx; },
            selectors: ['[data-u]'],
          },
          { selectors: ['[data-u]'], priority: 1 },
        ),
      ];

      await loadFeatures(features);

      expect(receivedCtx).toBeUndefined();
    });

    it('resolves features with equal priority in stable input order', async () => {
      const order: string[] = [];
      const features = [
        makeLoadable('first', { onSetup: () => { order.push('first'); } }, { global: true, priority: 10 }),
        makeLoadable('second', { onSetup: () => { order.push('second'); } }, { global: true, priority: 10 }),
        makeLoadable('third', { onSetup: () => { order.push('third'); } }, { global: true, priority: 10 }),
      ];

      await loadFeatures(features);

      expect(order).toEqual(['first', 'second', 'third']);
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
          { selectors: ['[data-missing]'], priority: 1 },
        ),
      ];

      await loadFeatures(features);

      expect(onEach).not.toHaveBeenCalled();
    });

    it('warns about circular dependency in a 3-node cycle', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(noop);
      const features = [
        makeLoadable('x', { onSetup: noop }, { global: true, priority: 1, dependencies: ['z'], timeout: 100 }),
        makeLoadable('y', { onSetup: noop }, { global: true, priority: 2, dependencies: ['x'], timeout: 100 }),
        makeLoadable('z', { onSetup: noop }, { global: true, priority: 3, dependencies: ['y'], timeout: 100 }),
      ];

      await loadFeatures(features, { timeout: 100 });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Circular dependency'),
      );
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
        makeLoadable('parent', { onSetup: noop }, { global: true, priority: 2 }),
      ];

      await loadFeatures(features, { timeout: 0 });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('deadlock risk'),
      );
    });
  });
});
