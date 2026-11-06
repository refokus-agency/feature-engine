import { describe, it, expect, vi, afterEach } from 'vitest';
import * as api from '../index.ts';
import { createFeatureRuntime, loadFeatures } from '../loader.ts';
import type { FeatureDescriptor, FeatureMeta } from '../types.ts';

const noop = () => {};

function makeLoadable(
  id: string,
  descriptor: Partial<FeatureDescriptor> = {},
): FeatureMeta {
  const full: FeatureDescriptor = {
    id,
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
    onDestroy: null,
    ...descriptor,
  };
  return {
    id,
    selectors: [...full.selectors],
    priority: full.priority,
    global: full.global,
    dependencies: [...full.dependencies],
    timeout: full.timeout,
    load: () => Promise.resolve({ default: full }),
  };
}

const $ = (selector: string) => document.querySelector(selector)!;
const idOf = (root: Document | Element) => (root as Element).id ?? 'doc';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('createFeatureRuntime', () => {
  it('is exported and mount returns a handle synchronously (AC-1)', async () => {
    expect(api.createFeatureRuntime).toBe(createFeatureRuntime);
    const runtime = createFeatureRuntime([]);
    const handle = runtime.mount();
    expect(handle.ready).toBeInstanceOf(Promise);
    await handle.ready;
    await expect(handle.dispose()).resolves.toBeUndefined();
    await expect(runtime.destroy()).resolves.toBeUndefined();
  });

  it('runs features matched in root, defaults to document, and ready never rejects (AC-2)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(noop);
    document.body.innerHTML =
      '<div id="a"><p class="x"></p></div><div id="b"><p class="y"></p></div>';
    const seen: string[] = [];
    const runtime = createFeatureRuntime([
      makeLoadable('x', {
        selectors: ['.x'],
        onEach: ({ root }) => {
          seen.push(idOf(root));
        },
      }),
      makeLoadable('y', {
        selectors: ['.y'],
        onSetup: () => {
          throw new Error('boom');
        },
      }),
    ]);
    await runtime.mount({ root: $('#a') }).ready;
    await expect(runtime.mount().ready).resolves.toBeUndefined();
    expect(seen).toEqual(['a', 'doc']);
    expect(console.warn).toHaveBeenCalledWith(
      '[loader] Feature "y" failed:',
      expect.any(Error),
    );
  });
});

describe('globals', () => {
  it('run onSetup/onReady on the first mount only, also when only globals match (AC-3)', async () => {
    document.body.innerHTML =
      '<div id="a"><p class="x"></p></div><div id="b"></div>';
    const calls: string[] = [];
    const runtime = createFeatureRuntime([
      makeLoadable('g', {
        global: true,
        onSetup: () => {
          calls.push('g:setup');
        },
        onReady: () => {
          calls.push('g:ready');
        },
      }),
      makeLoadable('x', {
        selectors: ['.x'],
        onReady: () => {
          calls.push('x:ready');
        },
      }),
    ]);
    await runtime.mount({ root: $('#a') }).ready;
    await runtime.mount({ root: $('#a') }).ready;
    await runtime.mount({ root: $('#b') }).ready;
    expect(calls.filter((c) => c.startsWith('g:'))).toEqual([
      'g:setup',
      'g:ready',
    ]);
    expect(calls.filter((c) => c === 'x:ready')).toHaveLength(2);
  });

  it('feed their exposes to later mounts, waiting for a global still running (AC-4)', async () => {
    document.body.innerHTML =
      '<div id="a"></div><div id="b"><p class="p"></p></div>';
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const received: unknown[] = [];
    const runtime = createFeatureRuntime([
      makeLoadable('g', {
        global: true,
        onReady: () => pending,
        expose: () => ({ v: 1 }),
      }),
      makeLoadable('p', {
        selectors: ['.p'],
        dependencies: ['g'],
        onSetup: (_s, { deps }) => {
          received.push(deps.g);
        },
      }),
    ]);
    const first = runtime.mount({ root: $('#a') });
    const second = runtime.mount({ root: $('#b') });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(received).toEqual([]);
    release();
    await Promise.all([first.ready, second.ready]);
    await runtime.mount({ root: $('#b') }).ready;
    expect(received).toEqual([{ v: 1 }, { v: 1 }]);
  });

  it('are not retried after failing and skip their dependents later (edge case 10)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(noop);
    document.body.innerHTML = '<p class="p"></p>';
    const onSetup = vi.fn(() => {
      throw new Error('boom');
    });
    const dependent = vi.fn();
    const runtime = createFeatureRuntime([
      makeLoadable('g', { global: true, onSetup }),
      makeLoadable('p', {
        selectors: ['.p'],
        dependencies: ['g'],
        onSetup: dependent,
      }),
    ]);
    await runtime.mount().ready;
    await runtime.mount().ready;
    expect(onSetup).toHaveBeenCalledTimes(1);
    expect(dependent).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      '[loader] Feature "p" skipped — dependency "g" failed',
    );
  });

  it('leave deps[id] undefined for an unmatched page dependency a previous page exposed (AC-5)', async () => {
    document.body.innerHTML =
      '<div id="a"><p class="d"></p><p class="p"></p></div><div id="b"><p class="p"></p></div>';
    const received: unknown[] = [];
    const runtime = createFeatureRuntime([
      makeLoadable('d', { selectors: ['.d'], expose: () => 'from-a' }),
      makeLoadable('p', {
        selectors: ['.p'],
        dependencies: ['d'],
        onSetup: (_s, { deps }) => {
          received.push(deps.d);
        },
      }),
    ]);
    const first = runtime.mount({ root: $('#a') });
    await first.ready;
    await first.dispose();
    await runtime.mount({ root: $('#b') }).ready;
    expect(received).toEqual(['from-a', undefined]);
  });
});

describe('loadFeatures', () => {
  it('tolerates null options like before', async () => {
    await expect(
      loadFeatures([], null as unknown as undefined),
    ).resolves.toBeUndefined();
  });
});
