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

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const $ = (selector: string) => document.querySelector(selector)!;
const idOf = (root: Document | Element) => (root as Element).id ?? 'doc';

afterEach(() => {
  vi.useRealTimers();
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

  it('treat a sync throw, a missing module or a missing default as a failed load', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(noop);
    document.body.innerHTML = '<p class="p"></p>';
    const ran: unknown[] = [];
    const bad = (id: string, load: () => unknown, extra = {}) => ({
      ...makeLoadable(id, extra),
      load: load as FeatureMeta['load'],
    });
    const syncThrow = () => {
      throw new Error('sync');
    };
    const runtime = createFeatureRuntime(
      [
        makeLoadable('g', {
          global: true,
          expose: () => 'g',
          onDestroy: () => void ran.push('destroy g'),
        }),
        bad('q', syncThrow, { global: true }),
        bad('u', async () => undefined, { global: true }),
        bad('e', async () => ({}), { selectors: ['.p'], dependencies: ['g'] }),
        makeLoadable('p', {
          selectors: ['.p'],
          dependencies: ['g'],
          onSetup: (_s, { deps }) => ran.push(deps.g),
        }),
        makeLoadable('s', {
          selectors: ['.p'],
          dependencies: ['u'],
          onSetup: () => ran.push('s'),
        }),
      ],
      { timeout: 0 },
    );
    const first = runtime.mount();
    await expect(first.ready).resolves.toBeUndefined();
    await expect(first.dispose()).resolves.toBeUndefined();
    await expect(runtime.mount().ready).resolves.toBeUndefined();
    await expect(runtime.destroy()).resolves.toBeUndefined();
    expect(ran).toEqual(['g', 'g', 'destroy g']);
    const noDefault = new TypeError('The module has no default export');
    expect(warn.mock.calls).toEqual(
      expect.arrayContaining([
        ['[loader] Failed to load feature "q":', new Error('sync')],
        ['[loader] Failed to load feature "u":', noDefault],
        ['[loader] Failed to load feature "e":', noDefault],
      ]),
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

describe('dispose and destroy', () => {
  it('aborts, runs cleanups then onDestroy for set-up features, keeps globals alive (AC-6)', async () => {
    document.body.innerHTML =
      '<p class="p"></p><p class="p"></p><i class="q"></i>';
    const log: string[] = [];
    const signals: Record<string, AbortSignal> = {};
    const runtime = createFeatureRuntime([
      makeLoadable('g', {
        global: true,
        onSetup: (_s, { signal }) => {
          signals.g = signal;
        },
        onDestroy: () => {
          log.push('g:destroy');
        },
      }),
      makeLoadable('p', {
        selectors: ['.p'],
        onSetup: (_s, { signal }) => {
          signals.p = signal;
          return 'ctx-p';
        },
        onEach:
          ({ index }) =>
          () => {
            log.push(`p:cleanup:${index}:${signals.p!.aborted}`);
          },
        onDestroy: ({ ctx, signal, root }) => {
          log.push(
            `p:destroy:${ctx}:${signal === signals.p}:${root === document.body}`,
          );
        },
      }),
      makeLoadable('q', {
        selectors: ['.q'],
        onSetup: () => false,
        onDestroy: () => {
          log.push('q:destroy');
        },
      }),
      makeLoadable('r', { selectors: ['.q'] }),
    ]);
    const handle = runtime.mount({ root: document.body });
    await handle.ready;
    expect(log).toEqual([]);
    await handle.dispose();
    expect(log).toEqual([
      'p:cleanup:0:true',
      'p:cleanup:1:true',
      'p:destroy:ctx-p:true:true',
    ]);
    expect(signals.g!.aborted).toBe(false);
  });

  it('runs the lifecycle for A, onDestroy for A, then the lifecycle for B (AC-7)', async () => {
    document.body.innerHTML =
      '<div id="a"><p class="p"></p></div><div id="b"><p class="p"></p></div>';
    const log: string[] = [];
    const runtime = createFeatureRuntime([
      makeLoadable('p', {
        selectors: ['.p'],
        onSetup: (_s, { root }) => {
          log.push(`setup:${idOf(root)}`);
        },
        onEach: ({ root }) => {
          log.push(`each:${idOf(root)}`);
        },
        onReady: ({ root }) => {
          log.push(`ready:${idOf(root)}`);
        },
        onDestroy: ({ root }) => {
          log.push(`destroy:${idOf(root)}`);
        },
      }),
    ]);
    const a = runtime.mount({ root: $('#a') });
    await a.ready;
    await a.dispose();
    await runtime.mount({ root: $('#b') }).ready;
    expect(log).toEqual([
      'setup:a',
      'each:a',
      'ready:a',
      'destroy:a',
      'setup:b',
      'each:b',
      'ready:b',
    ]);
  });

  it('destroy disposes the current mount, then globals once in reverse topological order (AC-8)', async () => {
    document.body.innerHTML =
      '<div id="a"><p class="p"></p></div><div id="b"><p class="p"></p></div>';
    const log: string[] = [];
    const runtime = createFeatureRuntime([
      makeLoadable('g2', {
        global: true,
        dependencies: ['g1'],
        onDestroy: () => {
          log.push('g2');
        },
      }),
      makeLoadable('g1', {
        global: true,
        onDestroy: () => {
          log.push('g1');
        },
      }),
      makeLoadable('p', {
        selectors: ['.p'],
        onDestroy: ({ root }) => {
          log.push(`p:${idOf(root)}`);
        },
      }),
    ]);
    const a = runtime.mount({ root: $('#a') });
    await a.ready;
    await a.dispose();
    await runtime.mount({ root: $('#b') }).ready;
    await runtime.destroy();
    expect(log).toEqual(['p:a', 'p:b', 'g2', 'g1']);
  });

  it('destroy tears a global down before the page feature it depends on', async () => {
    document.body.innerHTML = '<p class="p"></p>';
    const log: string[] = [];
    const runtime = createFeatureRuntime([
      makeLoadable('p', {
        selectors: ['.p'],
        onDestroy: () => {
          log.push('p');
        },
      }),
      makeLoadable('g', {
        global: true,
        dependencies: ['p'],
        onDestroy: () => {
          log.push('g');
        },
      }),
    ]);
    await runtime.mount().ready;
    await runtime.destroy();
    expect(log).toEqual(['g', 'p']);
  });

  describe('teardown errors (AC-9)', () => {
    const failing = (log: string[]) => [
      makeLoadable('g', {
        global: true,
        onDestroy: () => Promise.reject(new Error('g-reject')),
      }),
      makeLoadable('p', {
        selectors: ['.p'],
        onEach: () => () => {
          throw new Error('cleanup-throw');
        },
        onDestroy: () => {
          log.push('p:destroy');
        },
      }),
    ];

    it('warn with [runtime], keep tearing down, and never reject', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(noop);
      document.body.innerHTML = '<p class="p"></p>';
      const log: string[] = [];
      const runtime = createFeatureRuntime(failing(log));
      const handle = runtime.mount();
      await handle.ready;
      await expect(handle.dispose()).resolves.toBeUndefined();
      await expect(runtime.destroy()).resolves.toBeUndefined();
      expect(log).toEqual(['p:destroy']);
      expect(warn.mock.calls).toEqual([
        [
          '[runtime] Teardown of feature "p" failed:',
          new Error('cleanup-throw'),
        ],
        ['[runtime] Teardown of feature "g" failed:', new Error('g-reject')],
      ]);
    });

    it('stay silent with logging: false', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(noop);
      document.body.innerHTML = '<p class="p"></p>';
      const runtime = createFeatureRuntime(failing([]), { logging: false });
      await runtime.mount().ready;
      await runtime.destroy();
      expect(warn).not.toHaveBeenCalled();
    });
  });
});

describe('dispose hardening', () => {
  it('aborts every signal before any cleanup or onDestroy (AC-11)', async () => {
    document.body.innerHTML = '<p class="p"></p>';
    const signals: AbortSignal[] = [];
    const seen: boolean[] = [];
    const record = () => {
      seen.push(...signals.map((s) => s.aborted));
    };
    const feature = (id: string, dependencies: string[] = []) =>
      makeLoadable(id, {
        selectors: ['.p'],
        dependencies,
        onSetup: (_s, { signal }) => {
          signals.push(signal);
        },
        onEach: () => record,
        onDestroy: record,
      });
    const handle = createFeatureRuntime([
      feature('a'),
      feature('b', ['a']),
    ]).mount();
    await handle.ready;
    await handle.dispose();
    expect(seen).toEqual([true, true, true, true, true, true, true, true]);
  });

  it('tears dependents down first, in parallel within a level (AC-12)', async () => {
    document.body.innerHTML = '<p class="p"></p>';
    const log: string[] = [];
    const slow = deferred();
    const feature = (id: string, dependencies: string[] = []) =>
      makeLoadable(id, {
        selectors: ['.p'],
        dependencies,
        onDestroy: async () => {
          log.push(`${id}:start`);
          if (id === 'a') await slow.promise;
          log.push(`${id}:end`);
        },
      });
    const handle = createFeatureRuntime([
      feature('a'),
      feature('b'),
      feature('c', ['a', 'b']),
    ]).mount();
    await handle.ready;
    const disposed = handle.dispose();
    await new Promise((r) => setTimeout(r, 0));
    expect(log).toEqual(['c:start', 'c:end', 'a:start', 'b:start', 'b:end']);
    slow.resolve();
    await disposed;
    expect(log.at(-1)).toBe('a:end');
  });

  it('resolves dispose and destroy at disposeTimeout when onDestroy never settles (AC-13)', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(noop);
    document.body.innerHTML = '<p class="p"></p>';
    const never = () => new Promise<void>(noop);
    const features = [
      makeLoadable('g', { global: true, onDestroy: never }),
      makeLoadable('p', { selectors: ['.p'], onDestroy: never }),
    ];
    const settlesAfter = async (promise: Promise<void>, ms: number) => {
      let settled = false;
      void promise.then(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(ms - 1);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(settled).toBe(true);
    };
    const handle = createFeatureRuntime(features).mount();
    await handle.ready;
    await settlesAfter(handle.dispose(), 3000);
    const capped = createFeatureRuntime(features, { disposeTimeout: 50 });
    await capped.mount().ready;
    await settlesAfter(capped.destroy(), 50);
    createFeatureRuntime(features, { disposeTimeout: -1 });
    expect(warn).toHaveBeenCalledWith(
      '[runtime] Invalid disposeTimeout (-1ms) — using default 3000ms',
    );
  });

  it('runs teardown once and returns the same promise on repeated calls (AC-14)', async () => {
    document.body.innerHTML = '<p class="p"></p>';
    const log: string[] = [];
    const runtime = createFeatureRuntime([
      makeLoadable('g', { global: true, onDestroy: () => void log.push('g') }),
      makeLoadable('p', {
        selectors: ['.p'],
        onEach: () => () => void log.push('cleanup'),
        onDestroy: () => void log.push('p'),
      }),
    ]);
    const handle = runtime.mount();
    await handle.ready;
    const disposed = handle.dispose();
    expect(handle.dispose()).toBe(disposed);
    const destroyed = runtime.destroy();
    expect(runtime.destroy()).toBe(destroyed);
    await Promise.all([disposed, destroyed, handle.dispose()]);
    expect(log).toEqual(['cleanup', 'p', 'g']);
  });

  it('destroy aborts first and runs each global onDestroy once, after the last page (AC-15)', async () => {
    document.body.innerHTML =
      '<div id="a"><p class="p"></p></div><div id="b"><p class="p"></p></div>';
    const log: string[] = [];
    let globalSignal: AbortSignal | undefined;
    const runtime = createFeatureRuntime([
      makeLoadable('g', {
        global: true,
        onSetup: (_s, { signal }) => {
          globalSignal = signal;
        },
        onDestroy: () => void log.push('g'),
      }),
      makeLoadable('p', {
        selectors: ['.p'],
        onDestroy: ({ root }) =>
          void log.push(`p:${idOf(root)}:${globalSignal!.aborted}`),
      }),
    ]);
    const a = runtime.mount({ root: $('#a') });
    await a.ready;
    await a.dispose();
    await runtime.mount({ root: $('#b') }).ready;
    await runtime.destroy();
    expect(log).toEqual(['p:a:false', 'p:b:true', 'g']);
  });

  it('dispose before ready aborts in-flight hooks, never starts the rest, tears down set-up ones (AC-16)', async () => {
    document.body.innerHTML = '<p class="p"></p>';
    const log: string[] = [];
    const setup = deferred();
    let signal: AbortSignal | undefined;
    const handle = createFeatureRuntime([
      makeLoadable('done', {
        selectors: ['.p'],
        onDestroy: () => void log.push('done:destroy'),
      }),
      makeLoadable('slow', {
        selectors: ['.p'],
        onSetup: async (_s, ctx) => {
          signal = ctx.signal;
          await setup.promise;
        },
        onEach: () => void log.push('slow:each'),
      }),
      makeLoadable('later', {
        selectors: ['.p'],
        priority: 1,
        onSetup: () => void log.push('later:setup'),
      }),
    ]).mount();
    await vi.waitFor(() => expect(signal).toBeDefined());
    await handle.dispose();
    expect(signal!.aborted).toBe(true);
    setup.resolve();
    await expect(handle.ready).resolves.toBeUndefined();
    expect(log).toEqual(['done:destroy']);
  });

  it('runs a cleanup returned after its mount was disposed immediately (AC-17, edge 14)', async () => {
    document.body.innerHTML = '<p class="p"></p>';
    const each = deferred();
    const cleanup = vi.fn();
    let started = false;
    const handle = createFeatureRuntime([
      makeLoadable('p', {
        selectors: ['.p'],
        onEach: async () => {
          started = true;
          await each.promise;
          return cleanup;
        },
      }),
    ]).mount();
    await vi.waitFor(() => expect(started).toBe(true));
    await handle.dispose();
    expect(cleanup).not.toHaveBeenCalled();
    each.resolve();
    await handle.ready;
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('destroy during the first mount aborts running globals and never starts later ones (edge 14)', async () => {
    const setup = deferred();
    let signal: AbortSignal | undefined;
    const g2 = vi.fn();
    const runtime = createFeatureRuntime([
      makeLoadable('g1', {
        global: true,
        onSetup: async (_s, ctx) => {
          signal = ctx.signal;
          await setup.promise;
        },
      }),
      makeLoadable('g2', { global: true, priority: 1, onSetup: g2 }),
    ]);
    const handle = runtime.mount();
    await vi.waitFor(() => expect(signal).toBeDefined());
    await runtime.destroy();
    expect(signal!.aborted).toBe(true);
    setup.resolve();
    await handle.ready;
    expect(g2).not.toHaveBeenCalled();
  });

  it('starts the next mount only after the previous capped dispose settles (AC-18)', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<p class="p"></p>';
    const log: string[] = [];
    const runtime = createFeatureRuntime([
      makeLoadable('p', {
        selectors: ['.p'],
        onSetup: () => void log.push('setup'),
        onDestroy: () =>
          new Promise<void>((resolve) => {
            setTimeout(() => {
              log.push('destroyed');
              resolve();
            }, 500);
          }),
      }),
    ]);
    const first = runtime.mount();
    await first.ready;
    void first.dispose();
    const next = runtime.mount();
    await vi.advanceTimersByTimeAsync(0);
    expect(log).toEqual(['setup']);
    await vi.advanceTimersByTimeAsync(499);
    expect(log).toEqual(['setup']);
    await vi.advanceTimersByTimeAsync(1);
    await next.ready;
    expect(log).toEqual(['setup', 'destroyed', 'setup']);
  });

  it('waits for a dispose of the previous mount called right after mount() (AC-18)', async () => {
    document.body.innerHTML = '<p class="p"></p>';
    const log: string[] = [];
    const gate = deferred();
    const runtime = createFeatureRuntime([
      makeLoadable('p', {
        selectors: ['.p'],
        onSetup: () => void log.push('setup'),
        onDestroy: async () => {
          log.push('destroy-start');
          await gate.promise;
          log.push('destroy-end');
        },
      }),
    ]);
    const first = runtime.mount();
    await first.ready;
    const next = runtime.mount();
    void first.dispose();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(log).toEqual(['setup', 'destroy-start']);
    gate.resolve();
    await next.ready;
    expect(log).toEqual(['setup', 'destroy-start', 'destroy-end', 'setup']);
  });

  it('disposeTimeout 0 disables the cap, and the cap timer is cleared', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<p class="p"></p>';
    const slow = () =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, 5000);
      });
    const features = [
      makeLoadable('p', { selectors: ['.p'], onDestroy: slow }),
    ];
    const uncapped = createFeatureRuntime(features, { disposeTimeout: 0 });
    const handle = uncapped.mount();
    await handle.ready;
    let settled = false;
    void handle.dispose().then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(4999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
    const capped = createFeatureRuntime([makeLoadable('q', { global: true })]);
    await capped.mount().ready;
    await capped.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a first-mount dispose after destroy settles with the shared teardown pass', async () => {
    document.body.innerHTML = '<p class="p"></p>';
    const log: string[] = [];
    const gate = deferred();
    const runtime = createFeatureRuntime([
      makeLoadable('g', { global: true, onDestroy: () => void log.push('g') }),
      makeLoadable('p', {
        selectors: ['.p'],
        dependencies: ['g'],
        onDestroy: async () => {
          await gate.promise;
          log.push('p');
        },
      }),
    ]);
    const handle = runtime.mount();
    await handle.ready;
    const destroyed = runtime.destroy();
    let disposed = false;
    void handle.dispose().then(() => {
      disposed = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(disposed).toBe(false);
    gate.resolve();
    await destroyed;
    expect(disposed).toBe(true);
    expect(log).toEqual(['p', 'g']);
  });

  it('destroy waits for an earlier mount still disposing before tearing down globals (AC-15)', async () => {
    document.body.innerHTML = '<p class="p"></p>';
    const log: string[] = [];
    const gate = deferred();
    const runtime = createFeatureRuntime([
      makeLoadable('g', { global: true, onDestroy: () => void log.push('g') }),
      makeLoadable('p', {
        selectors: ['.p'],
        dependencies: ['g'],
        onDestroy: async () => {
          await gate.promise;
          log.push('p');
        },
      }),
    ]);
    const first = runtime.mount();
    await first.ready;
    void first.dispose();
    runtime.mount();
    const destroyed = runtime.destroy();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(log).toEqual([]);
    gate.resolve();
    await destroyed;
    expect(log).toEqual(['p', 'g']);
  });

  it('destroy right after the first mount() never loads its features', async () => {
    document.body.innerHTML = '<p class="p"></p>';
    const g = makeLoadable('g', { global: true });
    const p = makeLoadable('p', { selectors: ['.p'] });
    const loads = [vi.spyOn(g, 'load'), vi.spyOn(p, 'load')];
    const runtime = createFeatureRuntime([g, p]);
    const handle = runtime.mount();
    await runtime.destroy();
    await handle.ready;
    for (const load of loads) expect(load).not.toHaveBeenCalled();
  });

  it('dispose right after mount() never loads its features', async () => {
    document.body.innerHTML = '<p class="p"></p>';
    const p = makeLoadable('p', { selectors: ['.p'] });
    const load = vi.spyOn(p, 'load');
    const handle = createFeatureRuntime([p]).mount();
    await handle.dispose();
    await handle.ready;
    expect(load).not.toHaveBeenCalled();
  });

  it('mount after destroy warns and returns an inert handle (AC-19)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(noop);
    const onSetup = vi.fn();
    const runtime = createFeatureRuntime([
      makeLoadable('g', { global: true, onSetup }),
    ]);
    await runtime.destroy();
    const handle = runtime.mount();
    await expect(handle.ready).resolves.toBeUndefined();
    await expect(handle.dispose()).resolves.toBeUndefined();
    expect(onSetup).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      '[runtime] mount() called after destroy(): ignoring',
    );
  });

  it('skips onDestroy when onSetup failed and keeps it after a later failure (edges 11, 12)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(noop);
    document.body.innerHTML = '<p class="p"></p>';
    const log: string[] = [];
    const handle = createFeatureRuntime([
      makeLoadable('s', {
        selectors: ['.p'],
        onSetup: () => {
          throw new Error('setup');
        },
        onDestroy: () => void log.push('s:destroy'),
      }),
      makeLoadable('r', {
        selectors: ['.p'],
        onEach: () => () => void log.push('r:cleanup'),
        onReady: () => {
          throw new Error('ready');
        },
        onDestroy: () => void log.push('r:destroy'),
      }),
    ]).mount();
    await handle.ready;
    await handle.dispose();
    expect(log).toEqual(['r:cleanup', 'r:destroy']);
  });
});

describe('loadFeatures', () => {
  it('tolerates null options like before', async () => {
    await expect(
      loadFeatures([], null as unknown as undefined),
    ).resolves.toBeUndefined();
  });
});
