import type {
  NavigationAdapter,
  NavigationHandlers,
  NavigationInfo,
} from '../../types.ts';

export interface FakeNavigationAdapter {
  adapter: NavigationAdapter;
  readonly connectCalls: number;
  readonly disconnectCalls: number;
  leave(): void;
  enter(root: Element, nav?: NavigationInfo): void;
  cancel(): void;
}

// In-memory adapter: records connect/disconnect and forwards triggers to the handlers.
export function createFakeNavigationAdapter(
  disconnect: () => void = () => {},
): FakeNavigationAdapter {
  let handlers: NavigationHandlers | null = null;
  let connectCalls = 0;
  let disconnectCalls = 0;
  const connected = (): NavigationHandlers => {
    if (!handlers) throw new Error('fake adapter is not connected');
    return handlers;
  };
  return {
    adapter: {
      connect(h) {
        connectCalls++;
        handlers = h;
        return () => {
          disconnectCalls++;
          disconnect();
        };
      },
    },
    get connectCalls() {
      return connectCalls;
    },
    get disconnectCalls() {
      return disconnectCalls;
    },
    leave: () => connected().leave(),
    enter: (root, nav = { initial: false }) => connected().enter(root, nav),
    cancel: () => connected().cancel(),
  };
}
