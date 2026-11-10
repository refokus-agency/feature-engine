import type {
  BarbaHookData,
  BarbaHookName,
  BarbaLike,
  BarbaPage,
} from '../../adapters/barba/index.ts';

type HookFn = (data: BarbaHookData) => void;

export interface FakeBarba {
  barba: BarbaLike;
  /** Runs every callback registered on `name`, in order, and returns what each one returned. */
  fire(name: BarbaHookName, data: BarbaHookData): unknown[];
  /** Mimics `barba.init()`: sets `wrapper` and `data.current`, then fires the first-load `beforeEnter`. */
  init(page: BarbaPage): void;
  registered(name: BarbaHookName): number;
}

export function barbaPage(
  container: HTMLElement | null,
  href = '/',
  html = '<html></html>',
): BarbaPage {
  return { container, html, url: { href } };
}

// What Barba passes as `data` on a page transition.
export function transitionData(
  current: BarbaPage,
  next: BarbaPage,
  trigger: unknown = 'link',
): BarbaHookData {
  return { current, next, trigger };
}

export function createFakeBarba(): FakeBarba {
  const hooks = new Map<BarbaHookName, HookFn[]>();
  let wrapper: HTMLElement | undefined;
  let data: BarbaHookData | undefined;
  const register = (name: BarbaHookName) => (fn: HookFn) => {
    hooks.set(name, [...(hooks.get(name) ?? []), fn]);
  };
  const fire = (name: BarbaHookName, d: BarbaHookData) =>
    (hooks.get(name) ?? []).map((fn) => fn(d));
  return {
    barba: {
      hooks: {
        beforeLeave: register('beforeLeave'),
        afterLeave: register('afterLeave'),
        beforeEnter: register('beforeEnter'),
      },
      get wrapper() {
        return wrapper;
      },
      get data() {
        return data;
      },
    },
    fire,
    init(page) {
      wrapper = document.createElement('div');
      data = transitionData(page, page, 'barba');
      fire('beforeEnter', transitionData(barbaPage(null, ''), page, 'barba'));
    },
    registered: (name) => hooks.get(name)?.length ?? 0,
  };
}
