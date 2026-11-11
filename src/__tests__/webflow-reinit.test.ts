import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webflowReinit } from '../integrations/webflow/index.ts';
import type { NavigateEvent, NavigationInfo } from '../types.ts';

function createWebflow() {
  const ix2 = { init: vi.fn() };
  const webflow = {
    destroy: vi.fn(),
    ready: vi.fn(),
    require: vi.fn((_name: 'ix2') => ix2 as { init(): void } | undefined),
  };
  return { webflow, ix2 };
}

function createEvent(
  nav: NavigationInfo,
  overrides: Partial<NavigateEvent> = {},
): NavigateEvent {
  return {
    root: document.body,
    nav,
    signal: new AbortController().signal,
    ready: Promise.resolve(),
    ...overrides,
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('webflowReinit', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    document.documentElement.removeAttribute('data-wf-page');
  });

  describe('initial navigation', () => {
    it('does nothing on the first load', async () => {
      const { webflow, ix2 } = createWebflow();
      document.documentElement.setAttribute('data-wf-page', 'old');

      const result = webflowReinit(webflow)(
        createEvent({
          initial: true,
          html: '<html data-wf-page="next"><body></body></html>',
        }),
      );
      await flush();

      expect(result).toBeUndefined();
      expect(webflow.destroy).not.toHaveBeenCalled();
      expect(webflow.ready).not.toHaveBeenCalled();
      expect(webflow.require).not.toHaveBeenCalled();
      expect(ix2.init).not.toHaveBeenCalled();
      expect(document.documentElement.getAttribute('data-wf-page')).toBe('old');
    });
  });

  describe('later navigations', () => {
    it('waits for ready before calling Webflow', async () => {
      const { webflow, ix2 } = createWebflow();
      let resolveReady!: () => void;
      const ready = new Promise<void>((resolve) => {
        resolveReady = resolve;
      });

      webflowReinit(webflow)(createEvent({ initial: false }, { ready }));
      await flush();

      expect(webflow.destroy).not.toHaveBeenCalled();
      expect(webflow.ready).not.toHaveBeenCalled();
      expect(webflow.require).not.toHaveBeenCalled();

      resolveReady();
      await flush();

      expect(webflow.destroy).toHaveBeenCalledTimes(1);
      expect(webflow.ready).toHaveBeenCalledTimes(1);
      expect(ix2.init).toHaveBeenCalledTimes(1);
    });

    it('calls destroy, then ready, then ix2.init', async () => {
      const { webflow, ix2 } = createWebflow();

      webflowReinit(webflow)(createEvent({ initial: false }));
      await flush();

      expect(webflow.require).toHaveBeenCalledWith('ix2');
      expect(webflow.destroy).toHaveBeenCalledBefore(webflow.ready);
      expect(webflow.ready).toHaveBeenCalledBefore(webflow.require);
      expect(webflow.require).toHaveBeenCalledBefore(ix2.init);
    });
  });

  describe('page id sync', () => {
    it('sets the incoming data-wf-page on <html> before destroy', async () => {
      const { webflow } = createWebflow();
      document.documentElement.setAttribute('data-wf-page', 'old');
      let pageAtDestroy: string | null = null;
      webflow.destroy.mockImplementation(() => {
        pageAtDestroy = document.documentElement.getAttribute('data-wf-page');
      });

      webflowReinit(webflow)(
        createEvent({
          initial: false,
          html: '<html data-wf-page="next"><body></body></html>',
        }),
      );
      await flush();

      expect(webflow.destroy).toHaveBeenCalledTimes(1);
      expect(pageAtDestroy).toBe('next');
      expect(document.documentElement.getAttribute('data-wf-page')).toBe(
        'next',
      );
    });

    it.each([
      ['nav.html is undefined', undefined],
      ['the page has no data-wf-page', '<html><body></body></html>'],
    ])(
      'leaves <html> untouched and still re-inits when %s',
      async (_, html) => {
        const { webflow, ix2 } = createWebflow();
        document.documentElement.setAttribute('data-wf-page', 'old');

        webflowReinit(webflow)(createEvent({ initial: false, html }));
        await flush();

        expect(document.documentElement.getAttribute('data-wf-page')).toBe(
          'old',
        );
        expect(webflow.destroy).toHaveBeenCalledTimes(1);
        expect(webflow.ready).toHaveBeenCalledTimes(1);
        expect(ix2.init).toHaveBeenCalledTimes(1);
      },
    );
  });

  describe('aborted navigation', () => {
    it('skips the re-init when the signal aborts before ready', async () => {
      const { webflow, ix2 } = createWebflow();
      document.documentElement.setAttribute('data-wf-page', 'old');
      const controller = new AbortController();
      let resolveReady!: () => void;
      const ready = new Promise<void>((resolve) => {
        resolveReady = resolve;
      });

      webflowReinit(webflow)(
        createEvent(
          {
            initial: false,
            html: '<html data-wf-page="next"><body></body></html>',
          },
          { ready, signal: controller.signal },
        ),
      );
      controller.abort();
      resolveReady();
      await flush();

      expect(webflow.destroy).not.toHaveBeenCalled();
      expect(webflow.ready).not.toHaveBeenCalled();
      expect(ix2.init).not.toHaveBeenCalled();
      expect(document.documentElement.getAttribute('data-wf-page')).toBe('old');
    });
  });

  describe('site without IX2', () => {
    it('completes destroy and ready without throwing', async () => {
      const { webflow } = createWebflow();
      webflow.require.mockReturnValue(undefined);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      webflowReinit(webflow)(createEvent({ initial: false }));
      await flush();

      expect(webflow.destroy).toHaveBeenCalledTimes(1);
      expect(webflow.ready).toHaveBeenCalledTimes(1);
      expect(webflow.require).toHaveBeenCalledWith('ix2');
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe('errors', () => {
    it.each(['destroy', 'ready', 'ix2.init'] as const)(
      'warns with a [webflow] prefix when %s throws',
      async (call) => {
        const { webflow, ix2 } = createWebflow();
        const error = new Error(`${call} broke`);
        const target = call === 'ix2.init' ? ix2.init : webflow[call];
        target.mockImplementation(() => {
          throw error;
        });
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        webflowReinit(webflow)(createEvent({ initial: false }));
        await flush();

        expect(warn).toHaveBeenCalledWith('[webflow] re-init failed:', error);
      },
    );
  });
});
