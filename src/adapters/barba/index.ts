import type { NavigationAdapter, NavigationHandlers } from '../../types.ts';

/** The page fields of Barba's transition data that the adapter reads. */
export interface BarbaPage {
  container: HTMLElement | null;
  /** The full fetched HTML document, not the container markup. */
  html: string;
  url: { href?: string };
}

/** The `data` argument Barba passes to a hook. */
export interface BarbaHookData {
  current: BarbaPage;
  next: BarbaPage;
  /** `'barba'` on the first load. */
  trigger: unknown;
}

export type BarbaHookName = 'beforeLeave' | 'afterLeave' | 'beforeEnter';

/** The minimal structural shape of a Barba v2 instance. No dependency on `@barba/core`. */
export interface BarbaLike {
  hooks: Record<BarbaHookName, (fn: (data: BarbaHookData) => void) => void>;
  /** Undefined until `barba.init()` has run. */
  readonly wrapper?: HTMLElement | null;
  /** The current transition data; `current` is the live page after `init()`. */
  readonly data?: BarbaHookData;
}

/** Barba's `requestError` init option. Returning `false` skips Barba's forced reload. */
export type BarbaRequestError = (
  trigger: unknown,
  action: string,
  url: string,
  response: unknown,
  // biome-ignore lint/suspicious/noConfusingVoidType: `undefined` would reject a consumer function with no return statement
) => boolean | void;

export interface BarbaAdapterOptions {
  /** `'async'` (default) leaves on `afterLeave`; `'sync'` leaves on `beforeLeave`. */
  mode?: 'sync' | 'async';
}

export interface BarbaAdapter extends NavigationAdapter {
  /** Wraps the consumer's `requestError` so a failed request remounts the old page. */
  wrapRequestError(userFn?: BarbaRequestError): BarbaRequestError;
}

// Engine errors are reported, never thrown into Barba.
function safely(label: string, fn: () => void): void {
  try {
    fn();
  } catch (error) {
    console.warn(`[barba] ${label} failed:`, error);
  }
}

/** Connects Barba v2's global hooks to the runtime's navigation port. */
export function barbaAdapter(
  barba: BarbaLike,
  options: BarbaAdapterOptions = {},
): BarbaAdapter {
  const leaveHook = options.mode === 'sync' ? 'beforeLeave' : 'afterLeave';
  let initialEntered = false;
  // Barba hooks cannot be unregistered: they stay registered and do nothing once this is cleared.
  let live: NavigationHandlers | undefined;
  // Barba fires the first-load `beforeEnter` once; a late-init enter already mounted that page.
  const enterFrom = (page: BarbaPage, initial: boolean) => {
    const { container } = page;
    if (!live || !container) return;
    if (initial) {
      if (initialEntered) return;
      initialEntered = true;
    }
    live.enter(container, {
      initial,
      url: page.url.href,
      html: page.html,
    });
  };
  // Barba awaits a returned promise, so a hook callback never returns one.
  const guard =
    (hook: BarbaHookName, fn: (data: BarbaHookData) => unknown) =>
    (data: BarbaHookData): void =>
      safely(hook, () => fn(data));
  let registered = false;
  return {
    connect(handlers) {
      live = handlers;
      // A new connection has mounted nothing yet, so its first-load enter must run.
      initialEntered = false;
      // Registered once per adapter: a reconnect reuses them through `live`, never doubling them.
      if (!registered) {
        registered = true;
        barba.hooks[leaveHook](guard(leaveHook, () => live?.leave()));
        barba.hooks.beforeEnter(
          guard('beforeEnter', (data) =>
            enterFrom(data.next, data.trigger === 'barba'),
          ),
        );
      }
      // `wrapper` is set once `barba.init()` has run: its first-load hooks have already fired.
      if (barba.wrapper) {
        const current = barba.data?.current;
        if (current) safely('init', () => enterFrom(current, true));
      }
      // A connection replaced by a later `connect` no longer owns the hooks, so it cannot silence them.
      return () => {
        if (live === handlers) live = undefined;
      };
    },
    wrapRequestError(userFn) {
      return (trigger, action, url, response) => {
        safely('requestError cancel', () => live?.cancel());
        return userFn?.(trigger, action, url, response);
      };
    },
  };
}
