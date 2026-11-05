# Teardown

Page-transition libraries such as Barba.js swap the page content without a full reload, so whatever a feature registered on the outgoing page (ScrollTriggers, event listeners, observers, timers) stays alive unless it is released. Features declare that release themselves with two hooks.

## 1. Move manual cleanup into each feature's `onDestroy`

Instead of a global sweep in the transition code, such as:

```js
barba.hooks.leave(() => {
  ScrollTrigger.getAll().kill();
});
```

let each feature release what it created, in its own `onDestroy({ ctx, signal, root })`:

```js
export default defineFeature({
  id: 'parallax',
  selectors: ['[data-parallax]'],
  priority: 20,

  onSetup() {
    return { triggers: [] };
  },

  onEach({ el, ctx }) {
    ctx.triggers.push(ScrollTrigger.create({ trigger: el /* … */ }));
  },

  onDestroy({ ctx }) {
    for (const trigger of ctx.triggers) trigger.kill();
  },
});
```

A feature only releases its own resources, so features that do not need cleanup and resources owned by other code are left alone.

## 2. Per-element resources → cleanup returned from `onEach`; feature-wide resources → `onDestroy`

A resource created for one element is released by the function `onEach` returns for that element. `onEach` may be `async`, and the cleanup may be `async` too:

```js
onEach({ el }) {
  const observer = new ResizeObserver(onResize);
  observer.observe(el);
  return () => observer.disconnect();
},
```

The returned value must be a **function**. Anything else — a tween, an observer, a ScrollTrigger instance — is ignored and its resource leaks. Return `() => tween.kill()`, not `tween`.

A resource shared by the whole feature (a single window listener, a Lenis instance, a timer) is released in `onDestroy`, which receives the `ctx` returned by `onSetup`, the feature's `signal` and the `root` the feature was mounted into.

## 3. `onDestroy` runs only under `createFeatureRuntime`, never under `loadFeatures`

`loadFeatures` is stateless: it mounts features once and never tears them down, so under `loadFeatures` neither `onDestroy` nor the cleanups returned from `onEach` are ever called. Teardown runs only when features are mounted with `createFeatureRuntime` and that runtime disposes them.

## 4. How `dispose()` and `destroy()` run

- **Abort first.** Every feature signal of the mount is aborted before any cleanup or `onDestroy` runs, so anything registered with `{ signal }` is already released.
- **Order.** Dependents are torn down before their dependencies. Features at the same dependency depth are torn down in parallel, and a level finishes before the next one starts. Within one feature, the `onEach` cleanups run in element order, then `onDestroy`.
- **Who gets `onDestroy`.** Only features whose `onSetup` completed, or that have no `onSetup`. A feature whose `onSetup` returned `false` or threw gets none; one that failed later, for example in `onReady`, still gets its cleanups and `onDestroy`.
- **Cap.** The whole dispose resolves after `disposeTimeout` ms (default 3000) even if an `onDestroy` never settles. Work still running after the cap is not killed: the aborted signal is the cancellation channel.
- **Never rejects, idempotent.** A cleanup or `onDestroy` that throws or rejects is caught and reported with a `[runtime]` warning, and the rest of the teardown continues. Calling `dispose()` or `destroy()` again returns the same promise.
- **Before `ready`.** Disposing a mount before `ready` resolves aborts the hooks still in flight, never starts the features that had not started, and tears down what was already set up. A cleanup that an in-flight `onEach` returns after the dispose runs immediately.
- **Next mount.** `mount()` returns its handle synchronously and starts the new mount's features only after every capped dispose started before they start has settled, including one called right after `mount()`.
- **Globals.** Global features are torn down by `runtime.destroy()` only. The first mount ran them, so its features are torn down in the same pass as the globals, ordered only by declared dependencies: a global that depends on a page feature goes first, and one with no edge between them may run in parallel. A later mount, and any earlier mount still disposing, is disposed in full before any global.
- **Undisposed mounts.** `destroy()` only tracks the current mount. A mount you did not dispose before starting the next one is never aborted or torn down by `destroy()`, so dispose each mount before or right after the next `mount()`.
