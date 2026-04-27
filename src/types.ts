/** Context object passed to `onEach` lifecycle callbacks. */
export interface FeatureEachContext {
  el: Element;
  index: number;
  elements: NodeListOf<Element>;
  ctx: unknown;
}

/** Setup callback — receives matched selectors. Return `false` to abort; any other return value is passed as `ctx` to `onEach`. */
export type OnSetupFn = (
  selectors: string[],
) => unknown | false | Promise<unknown | false>;

/** Per-element callback — runs once for each element matching the feature selectors. */
export type OnEachFn = (ctx: FeatureEachContext) => void | Promise<void>;

/** Ready callback — runs after all elements have been processed. */
export type OnReadyFn = () => void | Promise<void>;

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
}
