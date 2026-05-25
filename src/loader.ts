import type { FeatureDescriptor, FeatureMeta, LoaderOptions } from './types.ts';

const DEFAULT_TIMEOUT_MS = 10_000;

type LogFn = (message: string, ...args: unknown[]) => void;

interface LoadedFeature {
  meta: FeatureMeta;
  descriptor: FeatureDescriptor;
  validDeps: string[];
}

interface DependencyGate {
  markReady: (id: string) => void;
  waitForDependency: (id: string) => Promise<void>;
}

interface ExecutionContext {
  knownIds: Set<string>;
  gate: DependencyGate;
  prunedEdges: Set<string>;
  failedIds: Set<string>;
  warn: LogFn;
}

function resolveTimeout(raw: number | undefined, warn: LogFn): number {
  const timeout = raw ?? DEFAULT_TIMEOUT_MS;
  if (timeout < 0 || Number.isNaN(timeout)) {
    warn(
      `[loader] Invalid timeout (${timeout}ms) — using default ${DEFAULT_TIMEOUT_MS}ms`,
    );
    return DEFAULT_TIMEOUT_MS;
  }
  return timeout;
}

function matchFeatures(features: FeatureMeta[], warn: LogFn): FeatureMeta[] {
  const matched: FeatureMeta[] = [];

  for (const feature of features) {
    if (feature.global) {
      matched.push(feature);
      continue;
    }

    for (const selector of feature.selectors) {
      try {
        if (document.querySelector(selector)) {
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
  feature: FeatureDescriptor,
  selectors: string[],
  signal?: AbortSignal,
): Promise<void> {
  if (feature.enabled === false) return;
  if (signal?.aborted) return;

  let ctx: unknown;
  if (feature.onSetup) {
    ctx = await feature.onSetup(selectors);
    if (ctx === false) return;
  }

  if (signal?.aborted) return;

  if (feature.onEach && selectors.length) {
    const elements = document.querySelectorAll(selectors.join(', '));
    for (let j = 0; j < elements.length; j++) {
      if (signal?.aborted) return;
      await feature.onEach({ el: elements[j]!, index: j, elements, ctx });
    }
  }

  if (signal?.aborted) return;

  if (feature.onReady) {
    await feature.onReady();
  }
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
      callbacks.forEach((r) => r());
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
  { meta, descriptor, validDeps }: LoadedFeature,
  ctx: ExecutionContext,
  signal?: AbortSignal,
): Promise<void> {
  if (validDeps.length) {
    await Promise.all(validDeps.map(ctx.gate.waitForDependency));

    const failedDep = validDeps.find((d) => ctx.failedIds.has(d));
    if (failedDep) {
      ctx.warn(
        `[loader] Feature "${meta.id}" skipped — dependency "${failedDep}" failed`,
      );
      ctx.failedIds.add(meta.id);
      return;
    }
  }

  await initFeature(descriptor, meta.selectors, signal);
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
        try {
          const effectiveTimeout = feature.meta.timeout ?? globalTimeout;

          if (feature.validDeps.length && effectiveTimeout <= 0) {
            ctx.warn(
              `[loader] Feature "${feature.meta.id}" has dependencies but timeout is disabled — deadlock risk if circular`,
            );
          }

          await withTimeout(
            runWithDeps(feature, ctx, controller.signal),
            effectiveTimeout,
            feature.meta.id,
            controller,
          );
        } catch (err) {
          ctx.failedIds.add(feature.meta.id);
          ctx.warn(`[loader] Feature "${feature.meta.id}" failed:`, err);
        } finally {
          ctx.gate.markReady(feature.meta.id);
        }
      }),
    );
  }
}

interface LoadResult {
  loaded: LoadedFeature[];
  failedIds: Set<string>;
}

async function loadChunks(
  sortedFeatures: FeatureMeta[],
  knownIds: Set<string>,
  prunedEdges: Set<string>,
  gate: DependencyGate,
  warn: LogFn,
): Promise<LoadResult> {
  const results = await Promise.allSettled(sortedFeatures.map((f) => f.load()));
  const failedIds = new Set<string>();
  const loaded: LoadedFeature[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    const meta = sortedFeatures[i]!;

    if (result.status === 'rejected') {
      warn(`[loader] Failed to load feature "${meta.id}":`, result.reason);
      failedIds.add(meta.id);
      gate.markReady(meta.id);
      continue;
    }

    loaded.push({
      meta,
      descriptor: result.value.default,
      validDeps: buildValidDeps(meta, knownIds, prunedEdges, warn),
    });
  }

  return { loaded, failedIds };
}

export async function loadFeatures(
  features: FeatureMeta[],
  options?: Partial<LoaderOptions>,
): Promise<void> {
  const warn: LogFn =
    options?.logging !== false
      ? (msg, ...args) => console.warn(msg, ...args)
      : () => {};

  const globalTimeout = resolveTimeout(options?.timeout, warn);

  const matchedFeatures = matchFeatures(features, warn);
  if (!matchedFeatures.length) return;

  matchedFeatures.sort((a, b) => a.priority - b.priority);

  const { sorted: sortedFeatures, prunedEdges } = topoSort(matchedFeatures, warn);

  const matchedIds = new Set(sortedFeatures.map((f) => f.id));
  const knownIds = new Set(features.map((f) => f.id));
  const gate = createDependencyGate(features, matchedIds);

  const { loaded, failedIds } = await loadChunks(sortedFeatures, knownIds, prunedEdges, gate, warn);

  const ctx: ExecutionContext = { knownIds, gate, prunedEdges, failedIds, warn };

  const waves = groupIntoWaves(loaded, warn);

  await dispatchWaves(waves, ctx, globalTimeout);
}
