import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFeatureRuntime } from '../loader.ts';
import type {
  FeatureDescriptor,
  FeatureMeta,
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

function setup(disconnect?: () => void) {
  document.body.innerHTML =
    '<main id="a"><i data-p></i></main><main id="b"><i data-p></i></main>';
  const log: string[] = [];
  const fake = createFakeNavigationAdapter(disconnect);
  const runtime = createFeatureRuntime([pageFeature(log)], {
    navigation: fake.adapter,
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
    const { fake, log, a, b } = setup();
    fake.enter(a);
    fake.enter(b);
    await flush();
    await flush();
    expect(log).toEqual(['setup:b']);
  });

  it('leave disposes the page (AC-3)', async () => {
    const { fake, log, a } = setup();
    fake.enter(a);
    await flush();
    await flush();
    fake.leave();
    await flush();
    expect(log).toEqual(['setup:a', 'destroy:a']);
  });

  it('leave without a current page does nothing (AC-4)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(noop);
    const { fake, log, a } = setup();
    fake.leave();
    fake.enter(a);
    fake.leave();
    fake.leave();
    await flush();
    expect(log).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('cancel after leave remounts the last root (AC-5)', async () => {
    const { fake, log, a } = setup();
    fake.enter(a, { initial: true, url: '/a' });
    await flush();
    await flush();
    fake.leave();
    fake.cancel();
    await flush();
    await flush();
    expect(log).toEqual(['setup:a', 'destroy:a', 'setup:a']);
  });

  it('cancel before any enter, or while a page is mounted, does nothing (AC-6)', async () => {
    const { fake, log, a } = setup();
    fake.cancel();
    fake.enter(a);
    fake.cancel();
    await flush();
    await flush();
    expect(log).toEqual(['setup:a']);
  });

  it('destroy disconnects once, then tears down as before (AC-11)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(noop);
    const boom = new Error('boom');
    const { fake, log, runtime, a } = setup(() => {
      throw boom;
    });
    fake.enter(a);
    await flush();
    await flush();
    const destroyed = runtime.destroy();
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
    const { fake, log, runtime, a, b } = setup();
    fake.enter(a);
    await runtime.destroy();
    fake.leave();
    fake.enter(b);
    fake.cancel();
    await flush();
    expect(log.filter((l) => l.endsWith(':b'))).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
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

  it('rolls back and rethrows when connect throws after entering (edge 21)', async () => {
    document.body.innerHTML =
      '<main id="a"><i data-p></i></main><main id="b"><i data-p></i></main>';
    const log: string[] = [];
    const boom = new Error('boom');
    let handlers!: NavigationHandlers;
    expect(() =>
      createFeatureRuntime([pageFeature(log)], {
        navigation: {
          connect(h) {
            handlers = h;
            h.enter(document.getElementById('a')!, { initial: true });
            throw boom;
          },
        },
      }),
    ).toThrow(boom);
    handlers.enter(document.getElementById('b')!, { initial: false });
    await flush();
    await flush();
    expect(log).toEqual([]);
  });
});
