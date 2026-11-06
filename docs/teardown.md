# Teardown

Page-transition libraries such as Barba.js swap the page content without a full reload, so whatever a feature registered on the outgoing page (ScrollTriggers, event listeners, observers, timers) stays alive unless it is released. Features declare that release themselves with two hooks.

> **Teardown hooks run only when features are mounted with `createFeatureRuntime`.** If you mount with `loadFeatures`, keep your transition-level cleanup: `loadFeatures` is stateless, mounts features once and never tears them down, so neither `onDestroy` nor the cleanups returned from `onEach` are ever called.

## 1. Move manual cleanup into each feature's `onDestroy`

Instead of a global sweep in the transition code, such as:

```js
barba.hooks.leave(() => {
  ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
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
    for (const trigger of ctx?.triggers ?? []) trigger.kill();
  },
});
```

A feature only releases its own resources, so features that do not need cleanup and resources owned by other code are left alone.

`ctx` may be `undefined`, `false` or partially built when the feature did not complete its lifecycle (for example, `onSetup` returned `false` or timed out), so guard reads as above. `signal` is always already aborted by the time `onDestroy` runs; do not register new work on it.

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
