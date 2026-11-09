import type {
  FeatureDescriptor,
  FeatureMeta,
  FeatureRuntime,
  LoaderOptions,
  OnEachCleanup,
  MountHandle,
  MountOptions,
  RuntimeOptions,
} from './types.ts';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_DISPOSE_TIMEOUT_MS = 3000;

// Returned by `initFeature` when the feature's `expose` did NOT run — either no `expose` is
// declared, or the lifecycle short-circuited (disabled / aborted / `onSetup` returned `false`).
// Lets `runWithDeps` distinguish "expose ran and returned undefined" from "expose never ran",
// so `exposedValues` only ever holds entries for features whose `expose` actually executed.
const EXPOSE_SKIPPED = Symbol('expose-skipped');

type LogFn = (message: string, ...args: unknown[]) => void;

interface LoadedFeature {
  meta: FeatureMeta;
  descriptor: FeatureDescriptor;
  validDeps: string[];
}

// One feature's run in one mount: what dispose needs to tear it down.
interface FeatureRecord {
  id: string;
  descriptor: FeatureDescriptor;
  controller: AbortController;
  root: Document | Element;
  ctx: unknown;
  // `onSetup` completed without returning `false`, so `onDestroy` is owed.
  setupDone: boolean;
  // Teardown has started: a cleanup returned from now on runs immediately.
  tornDown: boolean;
  cleanups: OnEachCleanup[];
  // Validated dependency ids; teardown runs dependents before their dependencies.
  deps: string[];
}

// Holds the records of a mount, or of the runtime's globals. Once closed (dispose
// or destroy began), a record created for it is aborted before it starts.
interface RecordOwner {
  records: FeatureRecord[];
  closed: boolean;
}

interface DependencyGate {
  markReady: (id: string) => void;
  waitForDependency: (id: string) => Promise<void>;
}

// Gate and outcomes for a set of features: the runtime's globals, or one mount's page features.
interface FeatureScope {
  gate: DependencyGate;
  failedIds: Set<string>;
  // Accumulates the exposed value of each feature whose `expose` actually ran, keyed by feature id.
  // Features without `expose`, or that short-circuited (disabled/aborted/`onSetup`→false), get no
  // entry — so `exposedValues.has(id)` is a meaningful "did this feature expose?" check.
  exposedValues: Map<string, unknown>;
  owner: RecordOwner;
}

interface ExecutionContext {
  knownIds: Set<string>;
  prunedEdges: Set<string>;
  // Scope that owns feature `id`: the runtime's global scope for globals, the mount's otherwise.
  scopeOf: (id: string) => FeatureScope;
  warn: LogFn;
  // Resolved `root` option (`document` when omitted); scopes element queries in `initFeature`.
  root: Document | Element;
}

function resolveTimeout(
  raw: number | undefined,
  warn: LogFn,
  fallback = DEFAULT_TIMEOUT_MS,
  name = '[loader] Invalid timeout',
): number {
  const timeout = raw ?? fallback;
  if (timeout < 0 || Number.isNaN(timeout)) {
    warn(`${name} (${timeout}ms) — using default ${fallback}ms`);
    return fallback;
  }
  return timeout;
}

function matchFeatures(
  features: FeatureMeta[],
  root: Document | Element,
  warn: LogFn,
): FeatureMeta[] {
  const matched: FeatureMeta[] = [];

  for (const feature of features) {
    if (feature.global) {
      matched.push(feature);
      continue;
    }

    for (const selector of feature.selectors) {
      try {
        if (root.querySelector(selector)) {
          matched.push(feature);
          break;
        }
      } catch {
        warn(
          `[loader] Feature "${feature.id}" has invalid selector "${selector}" — skipping selector`,
        );
      }
    }
  }

  return matched;
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  id: string,
  controller?: AbortController,
): Promise<T> {
  if (ms <= 0) return promise;

  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise.finally(() => {
      if (timer !== undefined) clearTimeout(timer);
    }),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller?.abort();
        reject(new Error(`Feature "${id}" timed out after ${ms}ms`));
      }, ms);
    }),
  ]);
}

async function initFeature(
  record: FeatureRecord,
  selectors: string[],
  deps: Record<string, unknown>,
  warn: LogFn,
): Promise<unknown> {
  const { descriptor: feature, controller, root } = record;
  const { signal } = controller;
  if (feature.enabled === false) return EXPOSE_SKIPPED;
  if (signal.aborted) return EXPOSE_SKIPPED;

  let ctx: unknown;
  if (feature.onSetup) {
    ctx = await feature.onSetup(selectors, { deps, root, signal });
    if (ctx === false) {
      // Opting out ends the feature's lifetime: release what onSetup registered.
      controller.abort();
      return EXPOSE_SKIPPED;
    }
  }
  record.ctx = ctx;
  record.setupDone = true;

  if (signal.aborted) return EXPOSE_SKIPPED;

  if (feature.onEach && selectors.length) {
    const elements = root.querySelectorAll(selectors.join(', '));
    for (let j = 0; j < elements.length; j++) {
      if (signal.aborted) return EXPOSE_SKIPPED;
      const cleanup = await feature.onEach({
        el: elements[j]!,
        index: j,
        elements,
        ctx,
        root,
        signal,
      });
      if (typeof cleanup !== 'function') continue;
      if (record.tornDown) await attemptTeardown(cleanup, record.id, warn);
      else record.cleanups.push(cleanup);
    }
  }

  if (signal.aborted) return EXPOSE_SKIPPED;

  if (feature.onReady) {
    await feature.onReady({ ctx, signal, root });
  }

  if (signal.aborted) return EXPOSE_SKIPPED;

  // Project the feature's public API after its full lifecycle. Awaited so an async
  // `expose` resolves to a value (not a Promise) for dependents. `ctx` is `undefined`
  // when `onSetup` is absent. Returns EXPOSE_SKIPPED when no `expose` is declared.
  if (feature.expose) {
    return await feature.expose(ctx);
  }

  return EXPOSE_SKIPPED;
}

interface TopoSortResult {
  sorted: FeatureMeta[];
  prunedEdges: Set<string>;
}

function topoSort(matched: FeatureMeta[], warn: LogFn): TopoSortResult {
  const idToFeature = new Map(matched.map((f) => [f.id, f]));
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const result: FeatureMeta[] = [];
  const prunedEdges = new Set<string>();

  function visit(feature: FeatureMeta): void {
    if (visited.has(feature.id)) return;
    if (inStack.has(feature.id)) return;
    inStack.add(feature.id);
    for (const depId of feature.dependencies) {
      if (inStack.has(depId)) {
        warn(
          `[loader] Circular dependency: "${feature.id}" depends on "${depId}" which is already in the initialization stack — skipping`,
        );
        prunedEdges.add(`${feature.id}->${depId}`);
        continue;
      }
      const dep = idToFeature.get(depId);
      if (dep) visit(dep);
    }
    inStack.delete(feature.id);
    visited.add(feature.id);
    result.push(feature);
  }

  for (const feature of matched) {
    visit(feature);
  }

  return { sorted: result, prunedEdges };
}

function groupIntoWaves(
  loaded: LoadedFeature[],
  warn: LogFn,
): Map<number, LoadedFeature[]> {
  const effectiveWave = new Map<string, number>();
  const waves = new Map<number, LoadedFeature[]>();

  for (const feature of loaded) {
    const { id, priority, dependencies } = feature.meta;
    let wave = priority;
    let promotedBy: string | undefined;

    for (const depId of dependencies) {
      const depWave = effectiveWave.get(depId);
      if (depWave !== undefined && depWave > wave) {
        wave = depWave;
        promotedBy = depId;
      }
    }

    effectiveWave.set(id, wave);

    if (wave !== priority && promotedBy) {
      warn(
        `[loader] Feature "${id}" promoted from priority ${priority} to wave ${wave} — depends on "${promotedBy}" in later wave`,
      );
    }

    let waveGroup = waves.get(wave);
    if (!waveGroup) {
      waveGroup = [];
      waves.set(wave, waveGroup);
    }
    waveGroup.push(feature);
  }

  return waves;
}

function createDependencyGate(
  allFeatures: FeatureMeta[],
  matchedIds: Set<string>,
): DependencyGate {
  const readySet = new Set<string>();
  const depResolvers = new Map<string, Set<() => void>>();

  // Features not loaded must be treated as already-ready so dependents don't block
  for (const feature of allFeatures) {
    if (!matchedIds.has(feature.id)) {
      readySet.add(feature.id);
    }
  }

  function markReady(id: string): void {
    readySet.add(id);
    const callbacks = depResolvers.get(id);
    if (callbacks) {
      for (const resolve of callbacks) resolve();
      depResolvers.delete(id);
    }
  }

  function waitForDependency(id: string): Promise<void> {
    if (readySet.has(id)) return Promise.resolve();
    return new Promise((resolve) => {
      let callbacks = depResolvers.get(id);
      if (!callbacks) {
        callbacks = new Set();
        depResolvers.set(id, callbacks);
      }
      callbacks.add(resolve);
    });
  }

  return { markReady, waitForDependency };
}

function buildValidDeps(
  meta: FeatureMeta,
  knownIds: Set<string>,
  prunedEdges: Set<string>,
  warn: LogFn,
): string[] {
  if (!meta.dependencies.length) return [];
  return [...new Set(meta.dependencies)].filter((depId) => {
    if (depId === meta.id) {
      warn(`[loader] Feature "${meta.id}" depends on itself — ignoring`);
      return false;
    }
    if (!knownIds.has(depId)) {
      warn(
        `[loader] Feature "${meta.id}" depends on unknown "${depId}" — ignoring`,
      );
      return false;
    }
    if (prunedEdges.has(`${meta.id}->${depId}`)) {
      return false;
    }
    return true;
  });
}

async function runWithDeps(
  { meta, validDeps }: LoadedFeature,
  ctx: ExecutionContext,
  record: FeatureRecord,
): Promise<void> {
  const deps: Record<string, unknown> = {};

  if (validDeps.length) {
    await Promise.all(
      validDeps.map((d) => ctx.scopeOf(d).gate.waitForDependency(d)),
    );

    const failedDep = validDeps.find((d) => ctx.scopeOf(d).failedIds.has(d));
    if (failedDep) {
      ctx.warn(
        `[loader] Feature "${meta.id}" skipped — dependency "${failedDep}" failed`,
      );
      ctx.scopeOf(meta.id).failedIds.add(meta.id);
      return;
    }

    // Build the deps record from directly-declared (validated) dependencies' exposed values.
    for (const depId of validDeps) {
      deps[depId] = ctx.scopeOf(depId).exposedValues.get(depId);
    }
  }

  const exposed = await initFeature(record, meta.selectors, deps, ctx.warn);

  // Store the exposed value before this feature's markReady fires (markReady runs in
  // dispatchWaves's finally, after runWithDeps resolves). EXPOSE_SKIPPED means `expose` never
  // ran (no expose, or short-circuited) → no entry. The `!signal.aborted` guard blocks a
  // timed-out feature's abandoned background run from writing a ghost value after markReady
  // (when the timeout won the race, signal.aborted is true).
  if (exposed !== EXPOSE_SKIPPED && !record.controller.signal.aborted) {
    ctx.scopeOf(meta.id).exposedValues.set(meta.id, exposed);
  }
}

async function dispatchWaves(
  waves: Map<number, LoadedFeature[]>,
  ctx: ExecutionContext,
  globalTimeout: number,
): Promise<void> {
  const sortedWaves = [...waves.keys()].sort((a, b) => a - b);

  for (const waveKey of sortedWaves) {
    const waveFeatures = waves.get(waveKey)!;

    await Promise.allSettled(
      waveFeatures.map(async (feature) => {
        const controller = new AbortController();
        const scope = ctx.scopeOf(feature.meta.id);
        const record: FeatureRecord = {
          id: feature.meta.id,
          descriptor: feature.descriptor,
          controller,
          root: ctx.root,
          ctx: undefined,
          setupDone: false,
          tornDown: false,
          cleanups: [],
          deps: feature.validDeps,
        };
        scope.owner.records.push(record);
        if (scope.owner.closed) controller.abort();
        try {
          const effectiveTimeout = feature.meta.timeout ?? globalTimeout;

          if (feature.validDeps.length && effectiveTimeout <= 0) {
            ctx.warn(
              `[loader] Feature "${feature.meta.id}" has dependencies but timeout is disabled — deadlock risk if circular`,
            );
          }

          await withTimeout(
            runWithDeps(feature, ctx, record),
            effectiveTimeout,
            feature.meta.id,
            controller,
          );
        } catch (err) {
          // A failed feature is no longer alive: abort its signal so anything a hook
          // registered with it is released. Idempotent after a timeout abort.
          controller.abort();
          scope.failedIds.add(feature.meta.id);
          ctx.warn(`[loader] Feature "${feature.meta.id}" failed:`, err);
        } finally {
          scope.gate.markReady(feature.meta.id);
        }
      }),
    );
  }
}

async function loadChunks(
  sortedFeatures: FeatureMeta[],
  knownIds: Set<string>,
  prunedEdges: Set<string>,
  scopeOf: (id: string) => FeatureScope,
  warn: LogFn,
): Promise<LoadedFeature[]> {
  // A load() that throws synchronously is recorded as a failed load, like a rejection.
  const results = await Promise.allSettled(
    sortedFeatures.map((f) => Promise.resolve().then(() => f.load())),
  );
  const loaded: LoadedFeature[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    const meta = sortedFeatures[i]!;

    const descriptor =
      result.status === 'fulfilled' ? result.value?.default : undefined;
    if (descriptor == null) {
      const reason =
        result.status === 'rejected'
          ? result.reason
          : new TypeError('The module has no default export');
      warn(`[loader] Failed to load feature "${meta.id}":`, reason);
      const scope = scopeOf(meta.id);
      scope.failedIds.add(meta.id);
      scope.gate.markReady(meta.id);
      continue;
    }

    loaded.push({
      meta,
      descriptor,
      validDeps: buildValidDeps(meta, knownIds, prunedEdges, warn),
    });
  }

  return loaded;
}

function makeWarn(logging: boolean | undefined): LogFn {
  return logging !== false
    ? (msg, ...args) => console.warn(msg, ...args)
    : () => {};
}

function createScope(gate: DependencyGate, owner: RecordOwner): FeatureScope {
  return { gate, failedIds: new Set(), exposedValues: new Map(), owner };
}

async function attemptTeardown(
  step: () => void | Promise<void>,
  id: string,
  warn: LogFn,
): Promise<void> {
  try {
    await step();
  } catch (err) {
    warn(`[runtime] Teardown of feature "${id}" failed:`, err);
  }
}

async function teardownRecord(
  record: FeatureRecord,
  warn: LogFn,
): Promise<void> {
  record.tornDown = true;
  const { id, descriptor, controller, root, ctx, setupDone, cleanups } = record;
  for (const cleanup of cleanups) await attemptTeardown(cleanup, id, warn);
  const onDestroy = setupDone ? descriptor.onDestroy : null;
  if (onDestroy) {
    await attemptTeardown(
      () => onDestroy({ ctx, signal: controller.signal, root }),
      id,
      warn,
    );
  }
}

// Dependency depth of each record among `records`: 0 for a record none of whose
// dependencies is in the list. `deps` holds only unpruned edges, so it is acyclic.
function computeLevels(records: FeatureRecord[]): Map<FeatureRecord, number> {
  const byId = new Map(records.map((r) => [r.id, r]));
  const levels = new Map<FeatureRecord, number>();
  const levelOf = (record: FeatureRecord): number => {
    let level = levels.get(record);
    if (level === undefined) {
      level = 0;
      for (const dep of record.deps) {
        const depRecord = byId.get(dep);
        if (depRecord) level = Math.max(level, levelOf(depRecord) + 1);
      }
      levels.set(record, level);
    }
    return level;
  };
  for (const record of records) levelOf(record);
  return levels;
}

// Aborts every record first, then tears down in parallel per level, deepest first.
async function teardownRecords(
  records: FeatureRecord[],
  warn: LogFn,
): Promise<void> {
  for (const record of records) record.controller.abort();
  const levels = computeLevels(records);
  for (let level = Math.max(-1, ...levels.values()); level >= 0; level--) {
    await Promise.all(
      records
        .filter((record) => levels.get(record) === level)
        .map((record) => teardownRecord(record, warn)),
    );
  }
}

// Settles when `promise` settles or after `ms`, whichever comes first; `0` disables the cap.
function withCap(promise: Promise<void>, ms: number): Promise<void> {
  if (ms <= 0) return promise;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cap = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  return Promise.race([promise, cap]).finally(() => clearTimeout(timer));
}

interface MountState extends RecordOwner {
  root: Document | Element;
  // The first mount runs the globals too.
  withGlobals: boolean;
  disposing?: Promise<void>;
}

interface RuntimeState {
  features: FeatureMeta[];
  globalIds: Set<string>;
  globals: FeatureScope;
  warn: LogFn;
  timeout: number;
  disposeTimeout: number;
  mounted: boolean;
  // The latest mount; `destroy()` tears it down with the globals.
  current: MountState;
  // Every dispose started so far; a new mount waits for it before matching.
  pendingDispose: Promise<unknown>;
  destroying?: Promise<void>;
}

async function runMount(rt: RuntimeState, state: MountState): Promise<void> {
  // A dispose started after this mount() is awaited too, until no new one is queued.
  let pending: Promise<unknown>;
  do {
    pending = rt.pendingDispose;
    await pending;
  } while (pending !== rt.pendingDispose);
  // Disposed or destroyed before matching: load nothing, create no records.
  if (state.closed) return;
  const { features, warn, timeout: globalTimeout } = rt;
  const { root } = state;
  const candidates = state.withGlobals
    ? features
    : features.filter((f) => !f.global);
  const matchedFeatures = matchFeatures(candidates, root, warn);
  if (!matchedFeatures.length) return;

  matchedFeatures.sort((a, b) => a.priority - b.priority);

  const { sorted: sortedFeatures, prunedEdges } = topoSort(
    matchedFeatures,
    warn,
  );

  const matchedIds = new Set(sortedFeatures.map((f) => f.id));
  const knownIds = new Set(features.map((f) => f.id));
  const local = createScope(createDependencyGate(features, matchedIds), state);
  const scopeOf = (id: string) => (rt.globalIds.has(id) ? rt.globals : local);

  const loaded = await loadChunks(
    sortedFeatures,
    knownIds,
    prunedEdges,
    scopeOf,
    warn,
  );

  const ctx: ExecutionContext = { knownIds, prunedEdges, scopeOf, warn, root };

  const waves = groupIntoWaves(loaded, warn);

  await dispatchWaves(waves, ctx, globalTimeout);
}

function disposeMount(rt: RuntimeState, state: MountState): Promise<void> {
  if (!state.disposing) {
    state.closed = true;
    state.disposing = withCap(
      teardownRecords(state.records.splice(0), rt.warn),
      rt.disposeTimeout,
    );
    rt.pendingDispose = Promise.all([rt.pendingDispose, state.disposing]);
  }
  return state.disposing;
}

async function destroyRuntime(rt: RuntimeState): Promise<void> {
  const { current, globals } = rt;
  globals.owner.closed = true;
  current.closed = true;
  // Abort first: every page and global signal, before any teardown runs.
  for (const record of [...current.records, ...globals.owner.records]) {
    record.controller.abort();
  }
  // The first mount shares the globals' topological order, so its records are torn
  // down with them, and its dispose() settles with that pass.
  if (current.withGlobals && !current.disposing) {
    const records = current.records.splice(0);
    records.push(...globals.owner.records.splice(0));
    current.disposing = withCap(
      teardownRecords(records, rt.warn),
      rt.disposeTimeout,
    );
    rt.pendingDispose = Promise.all([rt.pendingDispose, current.disposing]);
    return current.disposing;
  }
  // A later mount, and any earlier mount still disposing, finish before any global.
  await disposeMount(rt, current);
  await rt.pendingDispose;
  await teardownRecords(globals.owner.records.splice(0), rt.warn);
}

export function createFeatureRuntime(
  features: FeatureMeta[],
  options?: RuntimeOptions,
): FeatureRuntime {
  const warn = makeWarn(options?.logging);
  const rt: RuntimeState = {
    features,
    globalIds: new Set(features.filter((f) => f.global).map((f) => f.id)),
    globals: createScope(createDependencyGate([], new Set()), {
      records: [],
      closed: false,
    }),
    warn,
    timeout: resolveTimeout(options?.timeout, warn),
    disposeTimeout: resolveTimeout(
      options?.disposeTimeout,
      warn,
      DEFAULT_DISPOSE_TIMEOUT_MS,
      '[runtime] Invalid disposeTimeout',
    ),
    mounted: false,
    current: { root: document, records: [], closed: false, withGlobals: false },
    pendingDispose: Promise.resolve(),
  };

  function mount(mountOptions?: MountOptions): MountHandle {
    if (rt.destroying) {
      warn('[runtime] mount() called after destroy(): ignoring');
      return { ready: Promise.resolve(), dispose: () => Promise.resolve() };
    }
    const state: MountState = {
      root: mountOptions?.root ?? document,
      records: [],
      closed: false,
      withGlobals: !rt.mounted,
    };
    rt.mounted = true;
    rt.current = state;
    return {
      ready: runMount(rt, state),
      dispose: () => disposeMount(rt, state),
    };
  }

  function destroy(): Promise<void> {
    rt.destroying ??= withCap(destroyRuntime(rt), rt.disposeTimeout);
    return rt.destroying;
  }

  return { mount, destroy };
}

// Stateless: one mount of a fresh runtime, never disposed.
export async function loadFeatures(
  features: FeatureMeta[],
  options?: Partial<LoaderOptions>,
): Promise<void> {
  const { root, ...runtimeOptions } = options ?? {};
  await createFeatureRuntime(features, runtimeOptions).mount({ root }).ready;
}
