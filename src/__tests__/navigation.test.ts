import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFeatureRuntime } from '../loader.ts';
import type {
  FeatureDescriptor,
  FeatureMeta,
  NavigateEvent,
  NavigateHandler,
  NavigationHandlers,
} from '../types.ts';
import { createFakeNavigationAdapter } from './helpers/fake-navigation-adapter.ts';

const noop = () => {};
const flush = () => new Promise((r) => setTimeout(r, 0));

// A feature whose lifecycle is logged as `setup:<name>` / `destroy:<name>`. A page feature on
// `[data-p]` logs its root id; a global one logs its own id.
function makeFeature(
  log: string[],
  id: string,
  global: boolean,
  dependencies: string[] = [],
): FeatureMeta {
  const selectors = global ? [] : ['[data-p]'];
  const name = (root: Document | Element) =>
    global ? id : (root as Element).id;
  const descriptor: FeatureDescriptor = {
    id,
    selectors,
    priority: 0,
    global,
    dependencies,
    enabled: true,
    timeout: null,
    onSetup: (_s, { root }) => {
      log.push(`setup:${name(root)}`);
      return {};
    },
    onEach: null,
    onReady: null,
    expose: null,
    onDestroy: ({ root }) => {
      log.push(`destroy:${name(root)}`);
    },
  };
  return {
    id,
    selectors,
    priority: 0,
    global,
    dependencies,
    timeout: null,
    load: () => Promise.resolve({ default: descriptor }),
  };
}

const pageFeature = (log: string[]) => makeFeature(log, 'page', false);

function setup(onNavigate?: NavigateHandler[], disconnect?: () => void) {
  document.body.innerHTML =
    '<main id="a"><i data-p></i></main><main id="b"><i data-p></i></main>';
  const log: string[] = [];
  const fake = createFakeNavigationAdapter(disconnect);
  const runtime = createFeatureRuntime([pageFeature(log)], {
    navigation: fake.adapter,
    onNavigate,
  });
  const a = document.getElementById('a')!;
  const b = document.getElementById('b')!;
  return { log, fake, runtime, a, b };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('navigation adapter', () => {
  it('connects exactly once, at creation (AC-1)', () => {
    const { fake, runtime } = setup();
    expect(fake.connectCalls).toBe(1);
    runtime.mount({ root: document.body });
    expect(fake.connectCalls).toBe(1);
  });

  it('a second enter leaves the first one, so only the second root is mounted (AC-2)', async () => {
    const events: NavigateEvent[] = [];
    const { fake, log, a, b } = setup([(e) => void events.push(e)]);
    fake.enter(a);
    fake.enter(b);
    await events[1]!.ready;
    await flush();
    expect(events[0]!.signal.aborted).toBe(true);
    expect(log).toEqual(['setup:b']);
  });

  it('leave disposes the page, aborts its signal and runs its cleanups (AC-3)', async () => {
    const cleanup = vi.fn();
    let event!: NavigateEvent;
    const { fake, log, a } = setup([
      (e) => {
        event = e;
        return cleanup;
      },
    ]);
    fake.enter(a);
    await event.ready;
    fake.leave();
    expect(event.signal.aborted).toBe(true);
    expect(cleanup).toHaveBeenCalledTimes(1);
    await flush();
    expect(log).toEqual(['setup:a', 'destroy:a']);
  });

  it('leave without a current page does nothing (AC-4)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(noop);
    const cleanup = vi.fn();
    const { fake, log, a } = setup([() => cleanup]);
    fake.leave();
    fake.enter(a);
    fake.leave();
    fake.leave();
    await flush();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(log).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('cancel after leave remounts the last root with the last nav and reruns the handlers (AC-5)', async () => {
    const events: NavigateEvent[] = [];
    const { fake, log, a } = setup([(e) => void events.push(e)]);
    const nav = { initial: true, url: '/a' };
    fake.enter(a, nav);
    await events[0]!.ready;
    fake.leave();
    fake.cancel();
    expect(events).toHaveLength(2);
    expect(events[1]!.root).toBe(a);
    expect(events[1]!.nav).toBe(nav);
    expect(events[1]!.signal.aborted).toBe(false);
    await events[1]!.ready;
    expect(log).toEqual(['setup:a', 'destroy:a', 'setup:a']);
  });

  it('cancel before any enter, or while a page is mounted, does nothing (AC-6)', async () => {
    const handler = vi.fn();
    const { fake, log, a } = setup([handler]);
    fake.cancel();
    fake.enter(a);
    fake.cancel();
    await handler.mock.calls[0]![0].ready;
    await flush();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(log).toEqual(['setup:a']);
  });

  it('calls the handlers in order with { root, nav, signal, ready } once the mount started (AC-7)', async () => {
    const order: string[] = [];
    let event!: NavigateEvent;
    const { fake, log, b } = setup([
      (e) => {
        event = e;
        order.push('first');
      },
      () => void order.push('second'),
    ]);
    const nav = { initial: false, url: '/b', html: '<main></main>' };
    fake.enter(b, nav);
    expect(order).toEqual(['first', 'second']);
    expect(Object.keys(event).sort()).toEqual([
      'nav',
      'ready',
      'root',
      'signal',
    ]);
    expect(event.root).toBe(b);
    expect(event.nav).toBe(nav);
    expect(event.signal).toBeInstanceOf(AbortSignal);
    expect(log).toEqual([]);
    await event.ready;
    expect(log).toEqual(['setup:b']);
  });

  it('warns when a handler throws, still calls the rest and keeps the mount (AC-8)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(noop);
    const boom = new Error('boom');
    const after = vi.fn();
    const { fake, log, a } = setup([
      () => {
        throw boom;
      },
      after,
    ]);
    fake.enter(a);
    expect(warn).toHaveBeenCalledWith(
      '[runtime] onNavigate handler failed:',
      boom,
    );
    expect(after).toHaveBeenCalledTimes(1);
    await after.mock.calls[0]![0].ready;
    expect(log).toEqual(['setup:a']);
  });

  it('runs each cleanup once, on the next leave or on destroy, and ignores non-functions (AC-9)', async () => {
    const first = vi.fn();
    const second = vi.fn();
    let n = 0;
    const { fake, runtime, a, b } = setup([
      () => (n++ === 0 ? first : second),
      () => ({ kill: noop }) as unknown as () => void,
    ]);
    fake.enter(a);
    expect(first).not.toHaveBeenCalled();
    fake.enter(b);
    fake.leave();
    expect(first).toHaveBeenCalledTimes(1);
    fake.cancel();
    await runtime.destroy();
    await runtime.destroy();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });

  it('warns when a cleanup throws and still runs the rest (AC-10)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(noop);
    const boom = new Error('boom');
    const after = vi.fn();
    const { fake, a } = setup([
      () => () => {
        throw boom;
      },
      () => after,
    ]);
    fake.enter(a);
    fake.leave();
    expect(warn).toHaveBeenCalledWith(
      '[runtime] onNavigate cleanup failed:',
      boom,
    );
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('destroy aborts, runs the cleanups and disconnects once, then tears down as before (AC-11)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(noop);
    const boom = new Error('boom');
    const cleanup = vi.fn();
    let event!: NavigateEvent;
    const { fake, log, runtime, a } = setup(
      [
        (e) => {
          event = e;
          return cleanup;
        },
      ],
      () => {
        throw boom;
      },
    );
    fake.enter(a);
    await event.ready;
    const destroyed = runtime.destroy();
    expect(event.signal.aborted).toBe(true);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(fake.disconnectCalls).toBe(1);
    expect(warn).toHaveBeenCalledWith(
      '[runtime] navigation disconnect failed:',
      boom,
    );
    await destroyed;
    expect(runtime.destroy()).toBe(destroyed);
    expect(fake.disconnectCalls).toBe(1);
    expect(log).toEqual(['setup:a', 'destroy:a']);
  });

  it('ignores leave, enter and cancel after destroy, without mounting or warning (AC-12)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(noop);
    const handler = vi.fn(() => noop);
    const { fake, log, runtime, a, b } = setup([handler]);
    fake.enter(a);
    await runtime.destroy();
    fake.leave();
    fake.enter(b);
    fake.cancel();
    await flush();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(log.filter((l) => l.endsWith(':b'))).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('without an adapter the runtime stays manual and onNavigate is never called (AC-13)', async () => {
    document.body.innerHTML = '<main id="a"><i data-p></i></main>';
    const log: string[] = [];
    const handler = vi.fn();
    const runtime = createFeatureRuntime([pageFeature(log)], {
      onNavigate: [handler],
    });
    const handle = runtime.mount({ root: document.getElementById('a')! });
    await handle.ready;
    await handle.dispose();
    await runtime.destroy();
    expect(log).toEqual(['setup:a', 'destroy:a']);
    expect(handler).not.toHaveBeenCalled();
  });

  it('a handler that leaves skips the rest and runs its cleanup at once (edge 20)', async () => {
    const cleanup = vi.fn();
    const after = vi.fn();
    let fake!: ReturnType<typeof setup>['fake'];
    const ctx = setup([
      () => {
        fake.leave();
        return cleanup;
      },
      after,
    ]);
    fake = ctx.fake;
    fake.enter(ctx.a);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(after).not.toHaveBeenCalled();
    fake.leave();
    await flush();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(ctx.log).toEqual([]);
  });

  it('a handler that enters another page keeps each page with its own cleanups (edge 20)', async () => {
    const cleanups = { a: vi.fn(), b: vi.fn() };
    let fake!: ReturnType<typeof setup>['fake'];
    let b!: Element;
    const ctx = setup([
      ({ root }) => {
        if (root.id === 'a') fake.enter(b);
        return cleanups[root.id as 'a' | 'b'];
      },
    ]);
    ({ fake, b } = ctx);
    fake.enter(ctx.a);
    expect(cleanups.a).toHaveBeenCalledTimes(1);
    expect(cleanups.b).not.toHaveBeenCalled();
    fake.leave();
    expect(cleanups.a).toHaveBeenCalledTimes(1);
    expect(cleanups.b).toHaveBeenCalledTimes(1);
    await flush();
    expect(ctx.log).toEqual([]);
  });

  it('a handler that destroys the runtime still gets its cleanup run (edge 20)', async () => {
    const cleanup = vi.fn();
    let destroyed!: Promise<void>;
    let runtime!: ReturnType<typeof setup>['runtime'];
    const ctx = setup([
      () => {
        destroyed = runtime.destroy();
        return cleanup;
      },
    ]);
    runtime = ctx.runtime;
    ctx.fake.enter(ctx.a);
    expect(cleanup).toHaveBeenCalledTimes(1);
    await destroyed;
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(ctx.fake.disconnectCalls).toBe(1);
  });

  it('leaves a page entered from a cleanup before mounting the next one (edge 22)', async () => {
    document.body.insertAdjacentHTML(
      'beforeend',
      '<main id="c"><i data-p></i></main>',
    );
    const c = document.getElementById('c')!;
    const events: Record<string, NavigateEvent> = {};
    const cleanupC = vi.fn();
    let fake!: ReturnType<typeof setup>['fake'];
    const ctx = setup([
      (e) => {
        events[e.root.id] = e;
        if (e.root.id === 'a') return () => fake.enter(c);
        if (e.root.id === 'c') return cleanupC;
      },
    ]);
    fake = ctx.fake;
    fake.enter(ctx.a);
    fake.enter(ctx.b);
    expect(events.c!.signal.aborted).toBe(true);
    expect(cleanupC).toHaveBeenCalledTimes(1);
    expect(events.b!.signal.aborted).toBe(false);
    await flush();
    await flush();
    await ctx.runtime.destroy();
    const setups = ctx.log.filter((l) => l.startsWith('setup:'));
    const destroys = ctx.log.filter((l) => l.startsWith('destroy:'));
    expect(destroys.map((l) => l.slice(8)).sort()).toEqual(
      setups.map((l) => l.slice(6)).sort(),
    );
  });

  it('a destroy from a cleanup run by destroy disconnects once and shares the promise (edge 23)', async () => {
    let inner!: Promise<void>;
    let runtime!: ReturnType<typeof setup>['runtime'];
    const ctx = setup([
      () => () => {
        inner = runtime.destroy();
      },
    ]);
    runtime = ctx.runtime;
    ctx.fake.enter(ctx.a);
    const outer = runtime.destroy();
    expect(inner).toBe(outer);
    expect(runtime.destroy()).toBe(outer);
    await outer;
    expect(ctx.fake.disconnectCalls).toBe(1);
  });

  it('stops a page change when a cleanup it runs destroys the runtime (edge 24)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(noop);
    let runtime!: ReturnType<typeof setup>['runtime'];
    const cleanupB = vi.fn();
    const handler = vi.fn((e: NavigateEvent) =>
      e.root.id === 'a' ? () => void runtime.destroy() : cleanupB,
    );
    const ctx = setup([handler]);
    runtime = ctx.runtime;
    ctx.fake.enter(ctx.a);
    ctx.fake.enter(ctx.b);
    await runtime.destroy();
    expect(handler.mock.calls.map(([e]) => e.root.id)).toEqual(['a']);
    expect(cleanupB).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(ctx.fake.disconnectCalls).toBe(1);
  });

  it('a destroy from the adapter disconnect shares the promise and disconnects once (edge 23)', async () => {
    let inner!: Promise<void>;
    const fake = createFakeNavigationAdapter(() => {
      inner = runtime.destroy();
    });
    const runtime = createFeatureRuntime([], { navigation: fake.adapter });
    const outer = runtime.destroy();
    expect(inner).toBe(outer);
    expect(runtime.destroy()).toBe(outer);
    await outer;
    expect(fake.disconnectCalls).toBe(1);
  });

  it('stops a page change when a feature abort listener destroys the runtime (edge 25)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(noop);
    document.body.innerHTML =
      '<main id="a"><i data-p></i></main><main id="b"><i data-p></i></main>';
    const log: string[] = [];
    const fake = createFakeNavigationAdapter();
    let runtime!: ReturnType<typeof createFeatureRuntime>;
    const descriptor: FeatureDescriptor = {
      id: 'page',
      selectors: ['[data-p]'],
      priority: 0,
      global: false,
      dependencies: [],
      enabled: true,
      timeout: null,
      onSetup: (_s, { root, signal }) => {
        log.push(`setup:${(root as Element).id}`);
        signal.addEventListener('abort', () => void runtime.destroy());
        return {};
      },
      onEach: null,
      onReady: null,
      expose: null,
      onDestroy: null,
    };
    runtime = createFeatureRuntime(
      [
        {
          id: 'page',
          selectors: ['[data-p]'],
          priority: 0,
          global: false,
          dependencies: [],
          timeout: null,
          load: () => Promise.resolve({ default: descriptor }),
        },
      ],
      { navigation: fake.adapter },
    );
    fake.enter(document.getElementById('a')!);
    await flush();
    await flush();
    expect(log).toEqual(['setup:a']);
    fake.enter(document.getElementById('b')!);
    await flush();
    await flush();
    expect(log).toEqual(['setup:a']);
    expect(fake.disconnectCalls).toBe(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it('ignores an enter from a cleanup run by destroy (edge 18)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(noop);
    let fake!: ReturnType<typeof setup>['fake'];
    let b!: Element;
    const handler = vi.fn(() => () => fake.enter(b));
    const ctx = setup([handler]);
    ({ fake, b } = ctx);
    fake.enter(ctx.a);
    await ctx.runtime.destroy();
    await flush();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(ctx.log.filter((l) => l.endsWith(':b'))).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('mounts a page entered synchronously inside connect (edge 7)', async () => {
    document.body.innerHTML = '<main id="a"><i data-p></i></main>';
    const log: string[] = [];
    const handler = vi.fn();
    createFeatureRuntime([pageFeature(log)], {
      navigation: {
        connect(h) {
          h.enter(document.getElementById('a')!, { initial: true });
          return noop;
        },
      },
      onNavigate: [handler],
    });
    expect(handler).toHaveBeenCalledTimes(1);
    await handler.mock.calls[0]![0].ready;
    expect(log).toEqual(['setup:a']);
  });

  it('rolls back and rethrows when connect throws after entering (edge 21)', async () => {
    document.body.innerHTML =
      '<main id="a"><i data-p></i></main><main id="b"><i data-p></i></main>';
    const log: string[] = [];
    const boom = new Error('boom');
    const cleanup = vi.fn();
    let handlers!: NavigationHandlers;
    let event!: NavigateEvent;
    expect(() =>
      createFeatureRuntime([pageFeature(log)], {
        navigation: {
          connect(h) {
            handlers = h;
            h.enter(document.getElementById('a')!, { initial: true });
            throw boom;
          },
        },
        onNavigate: [
          (e) => {
            event = e;
            return cleanup;
          },
        ],
      }),
    ).toThrow(boom);
    expect(event.signal.aborted).toBe(true);
    expect(cleanup).toHaveBeenCalledTimes(1);
    handlers.enter(document.getElementById('b')!, { initial: false });
    await event.ready;
    await flush();
    expect(log).toEqual([]);
  });

  it('a leave before ready never sets the page up and ready still resolves (edge 10)', async () => {
    let event!: NavigateEvent;
    const { fake, log, a } = setup([
      (e) => {
        event = e;
      },
    ]);
    fake.enter(a);
    fake.leave();
    await event.ready;
    await flush();
    expect(log).toEqual([]);
  });

  it('destroy before any transition tears the first page down with the globals, in dependency order (risk)', async () => {
    document.body.innerHTML = '<main id="a"><i data-p></i></main>';
    const log: string[] = [];
    const fake = createFakeNavigationAdapter();
    const runtime = createFeatureRuntime(
      [pageFeature(log), makeFeature(log, 'g', true, ['page'])],
      { navigation: fake.adapter, onNavigate: [] },
    );
    fake.enter(document.getElementById('a')!);
    await flush();
    await flush();
    await runtime.destroy();
    expect(log).toEqual(['setup:a', 'setup:g', 'destroy:g', 'destroy:a']);
  });

  it('destroy after a transition disposes the pages before the globals (risk)', async () => {
    const log: string[] = [];
    document.body.innerHTML =
      '<main id="a"><i data-p></i></main><main id="b"><i data-p></i></main>';
    const fake = createFakeNavigationAdapter();
    const runtime = createFeatureRuntime(
      [pageFeature(log), makeFeature(log, 'g', true)],
      { navigation: fake.adapter },
    );
    fake.enter(document.getElementById('a')!);
    await flush();
    fake.enter(document.getElementById('b')!);
    await flush();
    await flush();
    await runtime.destroy();
    expect(log).toContain('destroy:a');
    expect(log.indexOf('destroy:a')).toBeLessThan(log.indexOf('setup:b'));
    expect(log.slice(-2)).toEqual(['destroy:b', 'destroy:g']);
  });
});
