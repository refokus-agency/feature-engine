import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadFeatures } from '../loader.ts';
import type { FeatureDescriptor, FeatureMeta } from '../types.ts';

const noop = () => {};

function makeDescriptor(
  overrides: Partial<FeatureDescriptor> = {},
): FeatureDescriptor {
  return {
    id: 'test-feature',
    selectors: ['[data-test]'],
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
  const id = overrides.id ?? 'test-feature';
  return {
    id,
    selectors: ['[data-test]'],
    priority: 0,
    global: false,
    dependencies: [],
    timeout: null,
    load: () => Promise.resolve({ default: makeDescriptor({ id }) }),
    ...overrides,
  };
}

describe('loadFeatures', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  describe('happy path', () => {
    it('loads a single feature when its selector matches', async () => {
      document.body.innerHTML = '<div data-test></div>';
      const onSetup = vi.fn();
      const descriptor = makeDescriptor({ onSetup });
      const meta = makeMeta({
        load: () => Promise.resolve({ default: descriptor }),
      });

      await loadFeatures([meta]);
      expect(onSetup).toHaveBeenCalledOnce();
      expect(onSetup).toHaveBeenCalledWith(['[data-test]']);
    });

    it('does nothing with an empty features array', async () => {
      await expect(loadFeatures([])).resolves.toBeUndefined();
    });

    it('calls onSetup, onEach, and onReady in order', async () => {
      document.body.innerHTML = '<div data-test></div><div data-test></div>';
      const order: string[] = [];
      const descriptor = makeDescriptor({
        onSetup: () => { order.push('setup'); },
        onEach: () => { order.push('each'); },
        onReady: () => { order.push('ready'); },
      });
      const meta = makeMeta({
        load: () => Promise.resolve({ default: descriptor }),
      });

      await loadFeatures([meta]);
      expect(order).toEqual(['setup', 'each', 'each', 'ready']);
    });

    it('passes ctx from onSetup to onEach', async () => {
      document.body.innerHTML = '<div data-test></div>';
      const ctxValue = { count: 42 };
      const onEach = vi.fn();
      const descriptor = makeDescriptor({
        onSetup: () => ctxValue,
        onEach,
      });
      const meta = makeMeta({
        load: () => Promise.resolve({ default: descriptor }),
      });

      await loadFeatures([meta]);
      expect(onEach).toHaveBeenCalledWith(
        expect.objectContaining({
          el: expect.any(Object),
          index: 0,
          elements: expect.any(NodeList),
          ctx: ctxValue,
        }),
      );
    });

    it('aborts lifecycle when onSetup returns false', async () => {
      document.body.innerHTML = '<div data-test></div>';
      const onEach = vi.fn();
      const onReady = vi.fn();
      const descriptor = makeDescriptor({
        onSetup: () => false,
        onEach,
        onReady,
      });
      const meta = makeMeta({
        load: () => Promise.resolve({ default: descriptor }),
      });

      await loadFeatures([meta]);
      expect(onEach).not.toHaveBeenCalled();
      expect(onReady).not.toHaveBeenCalled();
    });

    it('loads global features regardless of DOM presence', async () => {
      const onSetup = vi.fn();
      const descriptor = makeDescriptor({
        id: 'global-feat',
        global: true,
        onSetup,
      });
      const meta = makeMeta({
        id: 'global-feat',
        global: true,
        selectors: ['[data-nonexistent]'],
        load: () => Promise.resolve({ default: descriptor }),
      });

      await loadFeatures([meta]);
      expect(onSetup).toHaveBeenCalledOnce();
    });

    it('does not load features whose selectors are not in DOM', async () => {
      const onSetup = vi.fn();
      const descriptor = makeDescriptor({ onSetup });
      const meta = makeMeta({
        selectors: ['[data-missing]'],
        load: () => Promise.resolve({ default: descriptor }),
      });

      await loadFeatures([meta]);
      expect(onSetup).not.toHaveBeenCalled();
    });

    it('provides index and elements to onEach', async () => {
      document.body.innerHTML = '<div data-test></div><div data-test></div><div data-test></div>';
      const indices: number[] = [];
      const descriptor = makeDescriptor({
        onEach: ({ index, elements }) => {
          indices.push(index);
          expect(elements.length).toBe(3);
        },
      });
      const meta = makeMeta({
        load: () => Promise.resolve({ default: descriptor }),
      });

      await loadFeatures([meta]);
      expect(indices).toEqual([0, 1, 2]);
    });
  });

  describe('dependency ordering', () => {
    it('executes dependencies before dependents', async () => {
      document.body.innerHTML = '<div data-a></div><div data-b></div>';
      const order: string[] = [];

      const descA = makeDescriptor({
        id: 'a',
        onSetup: () => { order.push('a'); },
      });
      const descB = makeDescriptor({
        id: 'b',
        onSetup: () => { order.push('b'); },
      });

      const metaA = makeMeta({
        id: 'a',
        selectors: ['[data-a]'],
        dependencies: ['b'],
        load: () => Promise.resolve({ default: descA }),
      });
      const metaB = makeMeta({
        id: 'b',
        selectors: ['[data-b]'],
        dependencies: [],
        load: () => Promise.resolve({ default: descB }),
      });

      await loadFeatures([metaA, metaB]);
      expect(order).toEqual(['b', 'a']);
    });

    it('handles multi-level dependencies (A→B→C)', async () => {
      document.body.innerHTML = '<div data-a></div><div data-b></div><div data-c></div>';
      const order: string[] = [];

      const descA = makeDescriptor({ id: 'a', onSetup: () => { order.push('a'); } });
      const descB = makeDescriptor({ id: 'b', onSetup: () => { order.push('b'); } });
      const descC = makeDescriptor({ id: 'c', onSetup: () => { order.push('c'); } });

      const metaA = makeMeta({
        id: 'a',
        selectors: ['[data-a]'],
        dependencies: ['b'],
        load: () => Promise.resolve({ default: descA }),
      });
      const metaB = makeMeta({
        id: 'b',
        selectors: ['[data-b]'],
        dependencies: ['c'],
        load: () => Promise.resolve({ default: descB }),
      });
      const metaC = makeMeta({
        id: 'c',
        selectors: ['[data-c]'],
        dependencies: [],
        load: () => Promise.resolve({ default: descC }),
      });

      await loadFeatures([metaA, metaB, metaC]);
      expect(order).toEqual(['c', 'b', 'a']);
    });

    it('pre-seeds unmatched features as ready', async () => {
      document.body.innerHTML = '<div data-a></div>';
      const onSetup = vi.fn();
      const descA = makeDescriptor({ id: 'a', onSetup });
      const descUnmatched = makeDescriptor({ id: 'unmatched' });

      const metaA = makeMeta({
        id: 'a',
        selectors: ['[data-a]'],
        dependencies: ['unmatched'],
        load: () => Promise.resolve({ default: descA }),
      });
      const metaUnmatched = makeMeta({
        id: 'unmatched',
        selectors: ['[data-nope]'],
        load: () => Promise.resolve({ default: descUnmatched }),
      });

      await loadFeatures([metaA, metaUnmatched]);
      expect(onSetup).toHaveBeenCalledOnce();
    });

    it('warns and ignores unknown dependencies', async () => {
      document.body.innerHTML = '<div data-a></div>';
      const warn = vi.spyOn(console, 'warn').mockImplementation(noop);
      const onSetup = vi.fn();
      const descA = makeDescriptor({ id: 'a', onSetup });

      const metaA = makeMeta({
        id: 'a',
        selectors: ['[data-a]'],
        dependencies: ['totally-unknown'],
        load: () => Promise.resolve({ default: descA }),
      });

      await loadFeatures([metaA]);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('depends on unknown "totally-unknown"'),
      );
      expect(onSetup).toHaveBeenCalledOnce();
    });
  });

  describe('circular dependencies', () => {
    it('warns on circular dependency and does not deadlock', async () => {
      document.body.innerHTML = '<div data-a></div><div data-b></div>';
      const warn = vi.spyOn(console, 'warn').mockImplementation(noop);

      const descA = makeDescriptor({ id: 'a', onSetup: () => {} });
      const descB = makeDescriptor({ id: 'b', onSetup: () => {} });

      const metaA = makeMeta({
        id: 'a',
        selectors: ['[data-a]'],
        dependencies: ['b'],
        timeout: 100,
        load: () => Promise.resolve({ default: descA }),
      });
      const metaB = makeMeta({
        id: 'b',
        selectors: ['[data-b]'],
        dependencies: ['a'],
        timeout: 100,
        load: () => Promise.resolve({ default: descB }),
      });

      const start = Date.now();
      await loadFeatures([metaA, metaB], { timeout: 100 });
      const elapsed = Date.now() - start;

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Circular dependency'),
      );
      expect(elapsed).toBeLessThan(500);
    });
  });

  describe('timeout', () => {
    it('aborts a hanging feature after timeout', async () => {
      document.body.innerHTML = '<div data-test></div>';
      const warn = vi.spyOn(console, 'warn').mockImplementation(noop);

      const descriptor = makeDescriptor({
        onSetup: () => new Promise(() => {}),
      });
      const meta = makeMeta({
        timeout: 50,
        load: () => Promise.resolve({ default: descriptor }),
      });

      await loadFeatures([meta]);

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        expect.any(Error),
      );
    });

    it('subsequent features still execute after a timeout', async () => {
      document.body.innerHTML = '<div data-a></div><div data-b></div>';
      vi.spyOn(console, 'warn').mockImplementation(noop);
      const onSetupB = vi.fn();

      const descA = makeDescriptor({
        id: 'a',
        onSetup: () => new Promise(() => {}),
      });
      const descB = makeDescriptor({ id: 'b', onSetup: onSetupB });

      const metaA = makeMeta({
        id: 'a',
        selectors: ['[data-a]'],
        timeout: 50,
        load: () => Promise.resolve({ default: descA }),
      });
      const metaB = makeMeta({
        id: 'b',
        selectors: ['[data-b]'],
        load: () => Promise.resolve({ default: descB }),
      });

      await loadFeatures([metaA, metaB], { timeout: 50 });
      expect(onSetupB).toHaveBeenCalledOnce();
    });

    it('dependents still execute after a dependency times out', async () => {
      document.body.innerHTML = '<div data-a></div><div data-b></div>';
      vi.spyOn(console, 'warn').mockImplementation(noop);
      const onSetupB = vi.fn();

      const descA = makeDescriptor({
        id: 'a',
        onSetup: () => new Promise(() => {}),
      });
      const descB = makeDescriptor({ id: 'b', onSetup: onSetupB });

      const metaA = makeMeta({
        id: 'a',
        selectors: ['[data-a]'],
        timeout: 50,
        load: () => Promise.resolve({ default: descA }),
      });
      const metaB = makeMeta({
        id: 'b',
        selectors: ['[data-b]'],
        dependencies: ['a'],
        load: () => Promise.resolve({ default: descB }),
      });

      await loadFeatures([metaA, metaB], { timeout: 100 });
      expect(onSetupB).toHaveBeenCalledOnce();
    });

    it('uses global opts.timeout as fallback when meta.timeout is null', async () => {
      document.body.innerHTML = '<div data-test></div>';
      const warn = vi.spyOn(console, 'warn').mockImplementation(noop);

      const descriptor = makeDescriptor({
        onSetup: () => new Promise(() => {}),
      });
      const meta = makeMeta({
        timeout: null,
        load: () => Promise.resolve({ default: descriptor }),
      });

      const start = Date.now();
      await loadFeatures([meta], { timeout: 50 });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(200);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        expect.any(Error),
      );
    });

    it('does not apply timeout when ms <= 0', async () => {
      document.body.innerHTML = '<div data-test></div>';
      const onSetup = vi.fn();
      const descriptor = makeDescriptor({ timeout: -1, onSetup });
      const meta = makeMeta({
        timeout: -1,
        load: () => Promise.resolve({ default: descriptor }),
      });

      await loadFeatures([meta]);
      expect(onSetup).toHaveBeenCalledOnce();
    });
  });

  describe('chunk load failure', () => {
    it('warns and continues when chunk load rejects', async () => {
      document.body.innerHTML = '<div data-a></div><div data-b></div>';
      const warn = vi.spyOn(console, 'warn').mockImplementation(noop);
      const onSetupB = vi.fn();

      const descB = makeDescriptor({ id: 'b', onSetup: onSetupB });

      const metaA = makeMeta({
        id: 'a',
        selectors: ['[data-a]'],
        load: () => Promise.reject(new Error('network error')),
      });
      const metaB = makeMeta({
        id: 'b',
        selectors: ['[data-b]'],
        load: () => Promise.resolve({ default: descB }),
      });

      await loadFeatures([metaA, metaB]);

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load feature'),
        expect.any(Error),
      );
      expect(onSetupB).toHaveBeenCalledOnce();
    });

    it('marks failed chunk as ready to unblock dependents', async () => {
      document.body.innerHTML = '<div data-a></div><div data-b></div>';
      vi.spyOn(console, 'warn').mockImplementation(noop);
      const onSetupB = vi.fn();

      const descB = makeDescriptor({ id: 'b', onSetup: onSetupB });

      const metaA = makeMeta({
        id: 'a',
        selectors: ['[data-a]'],
        load: () => Promise.reject(new Error('fail')),
      });
      const metaB = makeMeta({
        id: 'b',
        selectors: ['[data-b]'],
        dependencies: ['a'],
        load: () => Promise.resolve({ default: descB }),
      });

      await loadFeatures([metaA, metaB]);
      expect(onSetupB).toHaveBeenCalledOnce();
    });
  });

  describe('logging', () => {
    it('suppresses warnings when logging: false', async () => {
      document.body.innerHTML = '<div data-test></div>';
      const warn = vi.spyOn(console, 'warn').mockImplementation(noop);

      const descriptor = makeDescriptor({
        onSetup: () => new Promise(() => {}),
      });
      const meta = makeMeta({
        timeout: 50,
        load: () => Promise.resolve({ default: descriptor }),
      });

      await loadFeatures([meta], { logging: false });
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe('priority sorting', () => {
    it('loads features in priority order (lower first)', async () => {
      document.body.innerHTML = '<div data-a></div><div data-b></div><div data-c></div>';
      const order: string[] = [];

      const descA = makeDescriptor({ id: 'a', onSetup: () => { order.push('a'); } });
      const descB = makeDescriptor({ id: 'b', onSetup: () => { order.push('b'); } });
      const descC = makeDescriptor({ id: 'c', onSetup: () => { order.push('c'); } });

      const metaA = makeMeta({
        id: 'a',
        selectors: ['[data-a]'],
        priority: 10,
        load: () => Promise.resolve({ default: descA }),
      });
      const metaB = makeMeta({
        id: 'b',
        selectors: ['[data-b]'],
        priority: 1,
        load: () => Promise.resolve({ default: descB }),
      });
      const metaC = makeMeta({
        id: 'c',
        selectors: ['[data-c]'],
        priority: 5,
        load: () => Promise.resolve({ default: descC }),
      });

      await loadFeatures([metaA, metaB, metaC]);
      expect(order).toEqual(['b', 'c', 'a']);
    });
  });

  describe('invalid CSS selectors', () => {
    it('warns and skips features with all-invalid selectors', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(noop);
      const onSetup = vi.fn();
      const descriptor = makeDescriptor({ onSetup });

      const meta = makeMeta({
        selectors: ['[[[invalid'],
        load: () => Promise.resolve({ default: descriptor }),
      });

      await loadFeatures([meta]);

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid CSS selector'),
      );
      expect(onSetup).not.toHaveBeenCalled();
    });

    it('loads feature with mixed valid/invalid selectors', async () => {
      document.body.innerHTML = '<div data-test></div>';
      const warn = vi.spyOn(console, 'warn').mockImplementation(noop);
      const onSetup = vi.fn();
      const descriptor = makeDescriptor({ onSetup });

      const meta = makeMeta({
        selectors: ['[[[invalid', '[data-test]'],
        load: () => Promise.resolve({ default: descriptor }),
      });

      await loadFeatures([meta]);

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid CSS selector'),
      );
      expect(onSetup).toHaveBeenCalledOnce();
    });
  });
});
