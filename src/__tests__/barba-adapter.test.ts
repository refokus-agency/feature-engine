import { describe, expect, it, vi } from 'vitest';
import { barbaAdapter } from '../adapters/barba/index.ts';
import { createFeatureRuntime } from '../loader.ts';
import type { FeatureDescriptor, FeatureMeta } from '../types.ts';
import {
  barbaPage,
  createFakeBarba,
  transitionData,
} from './helpers/fake-barba.ts';

function spyHandlers() {
  return { leave: vi.fn(), enter: vi.fn(), cancel: vi.fn() };
}

function el(): HTMLElement {
  return document.createElement('main');
}

describe('barbaAdapter — hook mapping', () => {
  it.each([
    ['default', undefined],
    ['async', { mode: 'async' as const }],
  ])('%s mode leaves on afterLeave and enters on beforeEnter', (_, options) => {
    const fake = createFakeBarba();
    const handlers = spyHandlers();
    barbaAdapter(fake.barba, options).connect(handlers);
    const from = barbaPage(el(), '/a');
    const to = barbaPage(el(), '/b', '<html>b</html>');

    fake.fire('beforeLeave', transitionData(from, to));
    expect(handlers.leave).not.toHaveBeenCalled();

    fake.fire('afterLeave', transitionData(from, to));
    expect(handlers.leave).toHaveBeenCalledTimes(1);
    expect(handlers.enter).not.toHaveBeenCalled();

    fake.fire('beforeEnter', transitionData(from, to));
    expect(handlers.enter).toHaveBeenCalledTimes(1);
    expect(handlers.enter.mock.calls[0]?.[0]).toBe(to.container);
  });

  it('sync mode leaves on beforeLeave, not on afterLeave, and enters on beforeEnter', () => {
    const fake = createFakeBarba();
    const handlers = spyHandlers();
    barbaAdapter(fake.barba, { mode: 'sync' }).connect(handlers);
    const from = barbaPage(el(), '/a');
    const to = barbaPage(el(), '/b');

    fake.fire('beforeLeave', transitionData(from, to));
    expect(handlers.leave).toHaveBeenCalledTimes(1);

    fake.fire('beforeEnter', transitionData(from, to));
    fake.fire('afterLeave', transitionData(from, to));
    expect(handlers.leave).toHaveBeenCalledTimes(1);
    expect(handlers.enter).toHaveBeenCalledTimes(1);
    expect(handlers.enter.mock.calls[0]?.[0]).toBe(to.container);
  });

  it.each([
    ['barba', true],
    ['link', false],
    ['popstate', false],
  ])(
    'enters with initial %s -> %s, the next url and the next html',
    (trigger, initial) => {
      const fake = createFakeBarba();
      const handlers = spyHandlers();
      barbaAdapter(fake.barba).connect(handlers);
      const to = barbaPage(el(), '/next', '<html>next</html>');

      fake.fire('beforeEnter', transitionData(barbaPage(el()), to, trigger));

      expect(handlers.enter).toHaveBeenCalledWith(to.container, {
        initial,
        url: '/next',
        html: '<html>next</html>',
      });
    },
  );
});

describe('barbaAdapter — hook return values', () => {
  it.each(['async', 'sync'] as const)(
    'returns undefined from every %s hook, never a promise',
    (mode) => {
      const fake = createFakeBarba();
      const pending = Promise.resolve();
      const handlers = {
        leave: vi.fn(() => pending),
        enter: vi.fn(() => pending),
        cancel: vi.fn(),
      };
      barbaAdapter(fake.barba, { mode }).connect(handlers);
      const data = transitionData(barbaPage(el(), '/a'), barbaPage(el(), '/b'));

      const results = (
        ['beforeLeave', 'afterLeave', 'beforeEnter'] as const
      ).flatMap((hook) => fake.fire(hook, data));

      expect(results).toHaveLength(2);
      expect(results).toEqual([undefined, undefined]);
      expect(handlers.leave).toHaveBeenCalledTimes(1);
      expect(handlers.enter).toHaveBeenCalledTimes(1);
    },
  );
});

describe('barbaAdapter — error isolation', () => {
  it.each([
    ['leave', 'afterLeave'],
    ['enter', 'beforeEnter'],
  ] as const)(
    'catches a throwing %s in %s and warns with [barba]',
    (handler, hook) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const fake = createFakeBarba();
      const handlers = spyHandlers();
      const boom = new Error(`${handler} failed`);
      handlers[handler].mockImplementation(() => {
        throw boom;
      });
      barbaAdapter(fake.barba).connect(handlers);
      const data = transitionData(barbaPage(el(), '/a'), barbaPage(el(), '/b'));

      expect(() => fake.fire(hook, data)).not.toThrow();
      expect(warn).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`^\\[barba\\] ${hook} failed`)),
        boom,
      );
      warn.mockRestore();
    },
  );

  it('catches a throwing enter on the late-init path', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fake = createFakeBarba();
    fake.init(barbaPage(el(), '/home'));
    const handlers = spyHandlers();
    handlers.enter.mockImplementation(() => {
      throw new Error('enter failed');
    });

    expect(() => barbaAdapter(fake.barba).connect(handlers)).not.toThrow();
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/^\[barba\]/),
      expect.any(Error),
    );
    warn.mockRestore();
  });
});

describe('barbaAdapter — first load', () => {
  it('enters the current page on connect when Barba is already initialized, once', () => {
    const fake = createFakeBarba();
    const first = barbaPage(el(), '/home', '<html>home</html>');
    fake.init(first);
    const handlers = spyHandlers();

    barbaAdapter(fake.barba).connect(handlers);

    expect(handlers.enter).toHaveBeenCalledTimes(1);
    expect(handlers.enter).toHaveBeenCalledWith(first.container, {
      initial: true,
      url: '/home',
      html: '<html>home</html>',
    });

    fake.fire(
      'beforeEnter',
      transitionData(barbaPage(null, ''), first, 'barba'),
    );
    expect(handlers.enter).toHaveBeenCalledTimes(1);
  });

  it('enters nothing on connect before init, then mounts the first page from init', () => {
    const fake = createFakeBarba();
    const handlers = spyHandlers();

    barbaAdapter(fake.barba).connect(handlers);
    expect(handlers.enter).not.toHaveBeenCalled();

    const first = barbaPage(el(), '/home', '<html>home</html>');
    fake.init(first);
    expect(handlers.enter).toHaveBeenCalledTimes(1);
    expect(handlers.enter).toHaveBeenCalledWith(first.container, {
      initial: true,
      url: '/home',
      html: '<html>home</html>',
    });
  });
});

describe('barbaAdapter — null containers', () => {
  it.each(['barba', 'link'])(
    'skips enter when beforeEnter (%s) has no next container',
    (trigger) => {
      const fake = createFakeBarba();
      const handlers = spyHandlers();
      barbaAdapter(fake.barba).connect(handlers);

      fake.fire(
        'beforeEnter',
        transitionData(barbaPage(el()), barbaPage(null, '/b'), trigger),
      );

      expect(handlers.enter).not.toHaveBeenCalled();
    },
  );

  it('skips the late-init enter when the current container is null', () => {
    const fake = createFakeBarba();
    fake.init(barbaPage(null, '/home'));
    const handlers = spyHandlers();

    barbaAdapter(fake.barba).connect(handlers);

    expect(handlers.enter).not.toHaveBeenCalled();
  });

  it('skips the late-init enter when Barba exposes a wrapper but no data', () => {
    const handlers = spyHandlers();
    const barba = { ...createFakeBarba().barba, wrapper: el() };

    barbaAdapter(barba).connect(handlers);

    expect(handlers.enter).not.toHaveBeenCalled();
  });
});

describe('barbaAdapter — wrapRequestError', () => {
  it('cancels, then forwards the arguments to userFn and returns its result', () => {
    const fake = createFakeBarba();
    const handlers = spyHandlers();
    const adapter = barbaAdapter(fake.barba);
    adapter.connect(handlers);
    const userFn = vi.fn(() => false);
    const response = { status: 500 };

    const result = adapter.wrapRequestError(userFn)(
      'link',
      'click',
      '/x',
      response,
    );

    expect(result).toBe(false);
    expect(handlers.cancel).toHaveBeenCalledTimes(1);
    expect(userFn).toHaveBeenCalledWith('link', 'click', '/x', response);
    expect(handlers.cancel.mock.invocationCallOrder[0]).toBeLessThan(
      userFn.mock.invocationCallOrder[0] as number,
    );
  });

  it('cancels and returns undefined without a userFn', () => {
    const fake = createFakeBarba();
    const handlers = spyHandlers();
    const adapter = barbaAdapter(fake.barba);
    adapter.connect(handlers);

    expect(
      adapter.wrapRequestError()('link', 'click', '/x', {}),
    ).toBeUndefined();
    expect(handlers.cancel).toHaveBeenCalledTimes(1);
  });

  it('warns when cancel throws and still returns the userFn result', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fake = createFakeBarba();
    const handlers = spyHandlers();
    const boom = new Error('cancel failed');
    handlers.cancel.mockImplementation(() => {
      throw boom;
    });
    const adapter = barbaAdapter(fake.barba);
    adapter.connect(handlers);
    const userFn = vi.fn(() => false);

    expect(adapter.wrapRequestError(userFn)('link', 'click', '/x', {})).toBe(
      false,
    );
    expect(userFn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/^\[barba\]/),
      boom,
    );
    warn.mockRestore();
  });
});

describe('barbaAdapter — disconnect', () => {
  it.each(['async', 'sync'] as const)(
    'turns the %s hooks into no-ops and keeps forwarding request errors to userFn',
    (mode) => {
      const fake = createFakeBarba();
      const handlers = spyHandlers();
      const adapter = barbaAdapter(fake.barba, { mode });
      const disconnect = adapter.connect(handlers);
      const wrapped = adapter.wrapRequestError(vi.fn(() => false));

      disconnect();
      const from = barbaPage(el(), '/a');
      const to = barbaPage(el(), '/b');
      for (const hook of [
        'beforeLeave',
        'afterLeave',
        'beforeEnter',
      ] as const) {
        fake.fire(hook, transitionData(from, to));
      }
      fake.init(barbaPage(el(), '/home'));

      expect(wrapped('link', 'click', '/x', {})).toBe(false);
      expect(handlers.leave).not.toHaveBeenCalled();
      expect(handlers.enter).not.toHaveBeenCalled();
      expect(handlers.cancel).not.toHaveBeenCalled();
      expect(fake.registered('beforeEnter')).toBe(1);
    },
  );

  it.each(['async', 'sync'] as const)(
    'registers the %s hooks once and routes a reconnect to the new handlers only',
    (mode) => {
      const fake = createFakeBarba();
      const adapter = barbaAdapter(fake.barba, { mode });
      const first = spyHandlers();
      const second = spyHandlers();
      const leaveHook = mode === 'sync' ? 'beforeLeave' : 'afterLeave';

      adapter.connect(first)();
      adapter.connect(second);
      const to = barbaPage(el(), '/b');
      fake.fire(leaveHook, transitionData(barbaPage(el(), '/a'), to));
      fake.fire('beforeEnter', transitionData(barbaPage(el(), '/a'), to));

      expect(fake.registered(leaveHook)).toBe(1);
      expect(fake.registered('beforeEnter')).toBe(1);
      expect(first.leave).not.toHaveBeenCalled();
      expect(first.enter).not.toHaveBeenCalled();
      expect(second.leave).toHaveBeenCalledTimes(1);
      expect(second.enter).toHaveBeenCalledTimes(1);
    },
  );

  it('ignores a stale disconnect from a connection that was already replaced', () => {
    const fake = createFakeBarba();
    const adapter = barbaAdapter(fake.barba);
    const first = spyHandlers();
    const second = spyHandlers();
    const navigate = () => {
      const to = barbaPage(el(), '/b');
      fake.fire('afterLeave', transitionData(barbaPage(el(), '/a'), to));
      fake.fire('beforeEnter', transitionData(barbaPage(el(), '/a'), to));
    };

    const disconnectFirst = adapter.connect(first);
    const disconnectSecond = adapter.connect(second);
    disconnectFirst();
    navigate();

    expect(first.leave).not.toHaveBeenCalled();
    expect(first.enter).not.toHaveBeenCalled();
    expect(second.leave).toHaveBeenCalledTimes(1);
    expect(second.enter).toHaveBeenCalledTimes(1);

    disconnectSecond();
    navigate();

    expect(second.leave).toHaveBeenCalledTimes(1);
    expect(second.enter).toHaveBeenCalledTimes(1);
  });

  it('mounts the current page again when it reconnects after init', () => {
    const fake = createFakeBarba();
    const adapter = barbaAdapter(fake.barba);
    const first = spyHandlers();
    const second = spyHandlers();
    const home = barbaPage(el(), '/home');

    adapter.connect(first);
    fake.init(home);
    adapter.connect(second);

    expect(first.enter).toHaveBeenCalledTimes(1);
    expect(second.enter).toHaveBeenCalledTimes(1);
    expect(second.enter).toHaveBeenCalledWith(home.container, {
      initial: true,
      url: '/home',
      html: home.html,
    });
  });

  it('forwards a request error to userFn before connect', () => {
    const adapter = barbaAdapter(createFakeBarba().barba);
    const userFn = vi.fn(() => false);

    expect(adapter.wrapRequestError(userFn)('link', 'click', '/x', {})).toBe(
      false,
    );
    expect(userFn).toHaveBeenCalledTimes(1);
  });
});

describe('barbaAdapter — with createFeatureRuntime', () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));

  function pageFeature(log: string[]): FeatureMeta {
    const descriptor: FeatureDescriptor = {
      id: 'page',
      selectors: ['[data-p]'],
      priority: 0,
      global: false,
      dependencies: [],
      enabled: true,
      timeout: null,
      onSetup: (_s, { root }) => {
        log.push(`setup:${(root as Element).id}`);
        return {};
      },
      onEach: null,
      onReady: null,
      expose: null,
      onDestroy: ({ root }) => {
        log.push(`destroy:${(root as Element).id}`);
      },
    };
    return {
      id: 'page',
      selectors: ['[data-p]'],
      priority: 0,
      global: false,
      dependencies: [],
      timeout: null,
      load: () => Promise.resolve({ default: descriptor }),
    };
  }

  it('disposes the old page and mounts the next on an async transition, then goes inert on destroy', async () => {
    document.body.innerHTML =
      '<main id="a"><i data-p></i></main><main id="b"><i data-p></i></main>';
    const a = document.getElementById('a') as HTMLElement;
    const b = document.getElementById('b') as HTMLElement;
    const log: string[] = [];
    const fake = createFakeBarba();
    const runtime = createFeatureRuntime([pageFeature(log)], {
      navigation: barbaAdapter(fake.barba),
    });

    fake.init(barbaPage(a, '/a'));
    await flush();
    const data = transitionData(barbaPage(a, '/a'), barbaPage(b, '/b'));
    for (const hook of ['beforeLeave', 'afterLeave', 'beforeEnter'] as const) {
      fake.fire(hook, data);
    }
    await flush();
    expect(log).toEqual(['setup:a', 'destroy:a', 'setup:b']);

    await runtime.destroy();
    log.length = 0;
    fake.fire(
      'afterLeave',
      transitionData(barbaPage(b, '/b'), barbaPage(a, '/a')),
    );
    fake.fire(
      'beforeEnter',
      transitionData(barbaPage(b, '/b'), barbaPage(a, '/a')),
    );
    await flush();
    expect(fake.registered('afterLeave')).toBe(1);
    expect(log).toEqual([]);
    document.body.innerHTML = '';
  });
});
