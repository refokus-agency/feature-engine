# Navigation adapters

Page-transition libraries swap the page container without reloading the document. `createFeatureRuntime` can follow those swaps on its own when it is given a **navigation adapter**: the runtime defines a small port, and an adapter translates one transition library's events into three calls on it (`leave`, `enter` and `cancel`). The runtime stays free of any library code, and each adapter is a separate entry point that imports the core with `import type` only.

Currently available:

| Adapter | Entry point |
| --- | --- |
| [Barba.js](#barbajs) | `@refokus-agency/feature-engine/barba` |

More adapters (for example one for the View Transition API) may be added later. Until then, any library can be connected with a [custom adapter](#writing-a-custom-adapter).

## 1. The navigation port

Without `navigation`, you drive the runtime yourself with `mount()` and `dispose()` (see the README's "Page transitions" section). With it, the adapter drives the mounts:

```ts
import { createFeatureRuntime } from '@refokus-agency/feature-engine';
import features from 'virtual:feature-metadata';

const runtime = createFeatureRuntime(features, {
  navigation: myAdapter,
  onNavigate: [
    ({ root, nav, signal, ready }) => {
      const observer = trackPage(root, nav.url);
      return () => observer.disconnect(); // runs on the next leave or on destroy()
    },
  ],
});
```

A `NavigationAdapter` has a single method:

```ts
interface NavigationAdapter {
  connect(handlers: NavigationHandlers): () => void;
}
```

- `connect` is called **once**, when the runtime is created, and receives the handlers. It returns a disconnect function.
- `runtime.destroy()` calls that disconnect function once. If `connect` throws, the runtime closes the port and `createFeatureRuntime` rethrows the error.

## 2. Handler contract

`connect` receives `{ leave, enter, cancel }`. None of them is awaited: each returns as soon as the work has started.

- **`leave()`** disposes the current page, aborts its navigation `signal` and runs the cleanups its `onNavigate` handlers returned. Without a current page it does nothing.
- **`enter(root, nav)`** mounts `root`, leaving the current page first if it is still mounted, then calls each `onNavigate` handler in order. `nav` is a `NavigationInfo`:

  ```ts
  interface NavigationInfo {
    initial: boolean; // true for the first page of the document
    url?: string;
    html?: string;
  }
  ```

- **`cancel()`** is for a navigation aborted after `leave()`: it remounts the last entered root with its last `nav` and runs the `onNavigate` handlers again. It does nothing while a page is mounted, or before any page was entered.

After `destroy()` starts, every handler call is ignored. `destroy()` aborts the navigation signal, runs the pending cleanups and calls the disconnect function, then tears down the mounts and the globals as it does without an adapter.

### `onNavigate` handlers

Each handler receives a `NavigateEvent`:

| Field | Meaning |
| --- | --- |
| `root` | The entered container. |
| `nav` | The `NavigationInfo` passed to `enter`. |
| `signal` | Aborted on the next leave, on a replacing enter, and on destroy. |
| `ready` | The mount handle's `ready` promise. |

- Only a returned function is kept, as a cleanup run on the next leave or on `destroy()`. Any other return value is ignored.
- A handler that throws is reported with a `[runtime]` warning; the others still run and the mount is kept.
- If a handler leaves the page (through the handlers or `destroy()`), the remaining handlers are skipped.
- Without `navigation`, `onNavigate` is never called.

## 3. Writing a custom adapter

An adapter only has to call the handlers at the right moments. A sketch for a library that emits `before-swap`, `after-swap` and `swap-failed` events:

```ts
import type { NavigationAdapter } from '@refokus-agency/feature-engine';

export function myRouterAdapter(router: MyRouter): NavigationAdapter {
  return {
    connect({ leave, enter, cancel }) {
      // The first page is already in the document.
      enter(router.container, { initial: true, url: location.href });

      const offs = [
        router.on('before-swap', () => leave()),
        router.on('after-swap', (container, url) => enter(container, { initial: false, url })),
        router.on('swap-failed', () => cancel()),
      ];
      return () => offs.forEach((off) => off()); // called once by destroy()
    },
  };
}
```

Guidelines, followed by the built-in adapters:

- Keep the core import type-only (`import type`), so the adapter adds no runtime dependency on the engine.
- Do not return the engine's work to the library: the handlers are not awaited, so the library never has to wait for features to mount or dispose.
- If the library cannot unregister its listeners, make the disconnect function silence them instead.

## 4. Barba.js

`@refokus-agency/feature-engine/barba` connects Barba v2's global hooks to the navigation port. It is typed against the minimal shape it reads (`BarbaLike`: `hooks`, `wrapper?`, `data?`), so the package has no dependency on `@barba/core`.

```ts
import barba from '@barba/core';
import { createFeatureRuntime } from '@refokus-agency/feature-engine';
import { barbaAdapter } from '@refokus-agency/feature-engine/barba';
import features from 'virtual:feature-metadata';

const navigation = barbaAdapter(barba, { mode: 'async' });
const runtime = createFeatureRuntime(features, { navigation });

barba.init({
  transitions: [/* ... */],
  requestError: navigation.wrapRequestError((trigger, action, url, response) => {
    // your own handling; return false to skip Barba's forced reload
  }),
});
```

### Options

| Option | Default | Meaning |
| --- | --- | --- |
| `mode` | `'async'` | Which Barba hook disposes the old page: `'async'` uses `afterLeave`, `'sync'` uses `beforeLeave`. |

- **`'async'`** disposes the old page on `afterLeave`, once its leave animation is done.
- **`'sync'`** disposes it on `beforeLeave`, because in a sync transition the new page enters before `afterLeave` fires. The old page's features are therefore torn down while its leave animation is still running.

Both modes mount the new page on `beforeEnter`, with `nav.url` set to the next URL and `nav.html` to the full fetched HTML document (not only the container markup).

### First load and late init

- The first page is mounted from Barba's first-load `beforeEnter` with `nav.initial: true`.
- If the runtime is created after `barba.init()`, `connect` mounts Barba's current container right away, and the first-load hook does not enter it a second time.

### Failed requests: `wrapRequestError`

`requestError` is a `barba.init()` option, not a hook, so the adapter cannot register it. Pass your handler through `navigation.wrapRequestError(userFn?)`:

- The wrapper calls `cancel()`, which remounts the old page after a leave and does nothing while a page is mounted, then returns `userFn`'s result.
- Without `userFn` it returns `undefined`, and Barba keeps its default reload.

### Errors and disconnect

- A hook never returns a promise to Barba, so Barba never waits for the engine. An error thrown by the runtime inside a hook is reported with a `[barba]` warning instead of reaching Barba.
- Barba hooks cannot be unregistered. After `runtime.destroy()` they stay registered and do nothing; the request-error wrapper still forwards to `userFn`.

### Types

```ts
import type {
  BarbaAdapter,            // NavigationAdapter + wrapRequestError(userFn?)
  BarbaAdapterOptions,     // { mode?: 'sync' | 'async' }
  BarbaLike,               // { hooks, wrapper?, data? }: the Barba v2 shape the adapter reads
  BarbaRequestError,       // (trigger, action, url, response) => boolean | void
} from '@refokus-agency/feature-engine/barba';
```
