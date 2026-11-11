# Navigation adapters

Page-transition libraries swap the page container without reloading the document. `createFeatureRuntime` can follow those swaps on its own when it is given a **navigation adapter**: the runtime defines a small port, and an adapter translates one transition library's events into three calls on it (`leave`, `enter` and `cancel`). The runtime stays free of any library code, and each adapter is a separate entry point that imports the core with `import type` only.

Currently available:

| Adapter | Entry point |
| --- | --- |
| [Barba.js](#barbajs) | `@refokus-agency/feature-engine/barba` |

The [Webflow re-init handler](#5-webflow-re-init-webflowreinit) (`@refokus-agency/feature-engine/webflow`) is an `onNavigate` handler, not an adapter: it works with any of them.

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

## 5. Webflow re-init: `webflowReinit`

Webflow's runtime and IX2 (its interactions engine) scan the DOM once, on page load. After a transition swaps the container, both still point at the old DOM, so the new page's interactions do not run. `@refokus-agency/feature-engine/webflow` ships an `onNavigate` handler that re-initializes them:

```ts
import barba from '@barba/core';
import { createFeatureRuntime } from '@refokus-agency/feature-engine';
import { barbaAdapter } from '@refokus-agency/feature-engine/barba';
import { webflowReinit, type WebflowLike } from '@refokus-agency/feature-engine/webflow';

// The package declares no global: type `window.Webflow` in your own code.
declare global {
  interface Window {
    Webflow: WebflowLike;
  }
}

const runtime = createFeatureRuntime(features, {
  navigation: barbaAdapter(barba),
  onNavigate: [webflowReinit(window.Webflow)],
});
```

On every navigation except the first load (`nav.initial`), the handler:

1. Waits for the event's `ready`, so features finish mounting first and IX2 sees the DOM they produced.
2. Stops if the navigation `signal` was aborted meanwhile; the next navigation runs its own re-init.
3. Copies the `data-wf-page` attribute of the fetched document's `<html>` (`nav.html`) onto `document.documentElement`. Without `nav.html` or the attribute, `<html>` is left untouched.
4. Calls `Webflow.destroy()`, `Webflow.ready()` and `Webflow.require('ix2')?.init()`, in that order. A site without IX2 skips the last call.

An error thrown by Webflow is reported with a `[webflow]` warning; it never rejects. The handler returns no cleanup.

- **Load order:** `webflowReinit(window.Webflow)` reads `window.Webflow` once, when the runtime is configured, so create the runtime after `webflow.js` has run. A bundle loaded as a module script (`type="module"`, Vite's default) already runs after the synchronous `webflow.js` at the end of `<body>`. If the bundle runs first, the handler holds `undefined` or Webflow's `[]` push queue, and every navigation is reported with a `[webflow] re-init failed` warning instead of re-initializing.
- **Barba sync transitions:** in a Barba transition with `sync: true` the new page enters before the old one has left (see [§4](#4-barbajs)), so depending on when Barba removes the old container, the re-init can run while it is still in the document and IX2 binds to elements that are about to be removed. The adapter's `mode` does not change this: it only picks the hook that disposes the old page, and it must match the transition. Prefer non-sync transitions on Webflow sites.
- **Limitation:** features must not read IX2 state in `onSetup`. IX2 is re-initialized only after every feature has settled.
- `Webflow.ready()` runs the site's `Webflow.push` callbacks again, as a manual re-init does.
- The instance is typed structurally (`WebflowLike`: `destroy`, `ready`, `require`), so the package has no dependency on Webflow, and the core entry never imports this one.

```ts
import type { WebflowLike } from '@refokus-agency/feature-engine/webflow';
```
