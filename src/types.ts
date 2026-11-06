/** Context object passed to `onEach` lifecycle callbacks. */
export interface FeatureEachContext {
  el: Element;
  index: number;
  elements: NodeListOf<Element>;
  ctx: unknown;
  /** Resolved loader root; `document` when no root option was given. */
  root: Document | Element;
  /** Same per-feature signal passed to `onSetup` and `onReady`. */
  signal: AbortSignal;
}

/** Context object passed as the second argument to `onSetup`; `deps` maps a declared dependency's feature id to its exposed value. */
export interface OnSetupContext {
  deps: Record<string, unknown>;
  /** Resolved loader root; `document` when no root option was given. */
  root: Document | Element;
  /** Aborted when the feature stops being alive (timeout, a hook throws, or `onSetup` returns `false`). Never aborted on success. */
  signal: AbortSignal;
}

/** Setup callback — receives matched selectors and a context of exposed dependencies. Return `false` to abort; any other return value is passed as `ctx` to `onEach`. */
export type OnSetupFn = (
  selectors: string[],
  context: OnSetupContext,
) => unknown | false | Promise<unknown | false>;

/** Per-element cleanup returned from `onEach`. */
export type OnEachCleanup = () => void | Promise<void>;

/** Per-element callback — runs once for each element matching the feature selectors. May return (or resolve to) a cleanup for that element. */
export type OnEachFn = (
  ctx: FeatureEachContext,
) => void | OnEachCleanup | Promise<void | OnEachCleanup>;

/** Context object passed to `onReady`. */
export interface OnReadyContext {
  /** Value returned by `onSetup`; `undefined` when `onSetup` is absent. */
  ctx: unknown;
  /** Same per-feature signal passed to `onSetup` and `onEach`. */
  signal: AbortSignal;
  /** Resolved loader root; `document` when no root option was given. */
  root: Document | Element;
}

/** Ready callback — runs after all elements have been processed. Implementations that ignore the context stay valid. */
export type OnReadyFn = (context: OnReadyContext) => void | Promise<void>;

/** Context object passed to `onDestroy`. */
export interface OnDestroyContext {
  /** Value returned by `onSetup`; `undefined` when `onSetup` is absent. */
  ctx: unknown;
  /** The feature's per-run signal. */
  signal: AbortSignal;
  /** Root the feature was mounted into; `document` when no root option was given. */
  root: Document | Element;
}

/** Feature-wide teardown. Invoked only by `createFeatureRuntime`, never by `loadFeatures`. */
export type OnDestroyFn = (context: OnDestroyContext) => void | Promise<void>;

/** Public-API projection called after the lifecycle completes; its return value is
 *  exposed to dependents. `ctx` is `any` so callers can annotate it with the concrete
 *  `onSetup` return type. */
export type ExposeFn = (ctx: any) => unknown;

/** Frozen, normalized runtime descriptor returned by `defineFeature()`. */
export interface FeatureDescriptor {
  id: string;
  selectors: readonly string[];
  priority: number;
  global: boolean;
  dependencies: readonly string[];
  enabled: boolean;
  timeout: number | null;
  onSetup: OnSetupFn | null;
  onEach: OnEachFn | null;
  onReady: OnReadyFn | null;
  expose: ExposeFn | null;
  onDestroy: OnDestroyFn | null;
}

/** User-facing input shape for `defineFeature()` — most fields are optional. */
export interface FeatureDescriptorInput {
  id: string;
  selectors: string[];
  priority: number;
  global?: boolean;
  dependencies?: string[];
  enabled?: boolean;
  timeout?: number | null;
  onSetup?: OnSetupFn | null;
  onEach?: OnEachFn | null;
  onReady?: OnReadyFn | null;
  expose?: ExposeFn | null;
  onDestroy?: OnDestroyFn | null;
}

/** Static metadata with a lazy loader, used by `loadFeatures()` at runtime. */
export interface FeatureMeta {
  id: string;
  selectors: string[];
  priority: number;
  global: boolean;
  dependencies: string[];
  timeout: number | null;
  load: () => Promise<{ default: FeatureDescriptor }>;
}

/** Configuration options for the `loadFeatures()` function. */
export interface LoaderOptions {
  timeout: number;
  logging: boolean;
  /** Container that scopes feature matching and element queries (descendants only). Defaults to `document`. */
  root?: Document | Element;
}

/** Configuration options for `createFeatureRuntime()`. */
export interface RuntimeOptions {
  /** Per-feature mount timeout in ms, same semantics as `LoaderOptions.timeout`. */
  timeout?: number;
  /** `false` silences `[loader]` and `[runtime]` warnings. */
  logging?: boolean;
  /** Cap in ms on one `dispose()` or `destroy()`, which resolves when it is reached. `0` disables it. Defaults to 3000. */
  disposeTimeout?: number;
}

/** Options for `FeatureRuntime.mount()`. */
export interface MountOptions {
  /** Container that scopes feature matching and element queries (descendants only). Defaults to `document`. */
  root?: Document | Element;
}

/** Handle for one mount of a `FeatureRuntime`. */
export interface MountHandle {
  /** Settles once every matched feature has settled. Never rejects. */
  ready: Promise<void>;
  /** Aborts and tears down this mount's non-global features. Capped, idempotent, never rejects. */
  dispose(): Promise<void>;
}

/** Stateful runtime returned by `createFeatureRuntime()`. */
export interface FeatureRuntime {
  /** Mounts features into a root and returns its handle synchronously. */
  mount(options?: MountOptions): MountHandle;
  /** Disposes the current mount, then tears down the global features. Capped, idempotent, never rejects. */
  destroy(): Promise<void>;
}
