import type { FeatureDescriptor, FeatureMeta, LoaderOptions } from './types.ts';

const DEFAULT_TIMEOUT_MS = 10_000;

type LogFn = (message: string, ...args: unknown[]) => void;

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

  matched.sort((a, b) => a.priority - b.priority);
  return matched;
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number | null,
  id: string,
  defaultTimeout: number,
): Promise<T> {
  const timeout = ms ?? defaultTimeout;
  if (timeout <= 0) return promise;

  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise.finally(() => {
      if (timer !== undefined) clearTimeout(timer);
    }),
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Feature "${id}" timed out after ${timeout}ms`)),
        timeout,
      );
    }),
  ]);
}

async function initFeature(
  feature: FeatureDescriptor,
  selectors: string[],
): Promise<void> {
  if (feature.enabled === false) return;

  let ctx: unknown;
  if (feature.onSetup) {
    ctx = await feature.onSetup(selectors);
    if (ctx === false) return;
  }

  if (feature.onEach && selectors.length) {
    const elements = document.querySelectorAll(selectors.join(', '));
    for (let j = 0; j < elements.length; j++) {
      await feature.onEach({ el: elements[j]!, index: j, elements, ctx });
    }
  }

  if (feature.onReady) {
    await feature.onReady();
  }
}

function topoSort(matched: FeatureMeta[], warn: LogFn): FeatureMeta[] {
  const idToFeature = new Map(matched.map((f) => [f.id, f]));
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const result: FeatureMeta[] = [];

  function visit(feature: FeatureMeta): void {
    if (visited.has(feature.id)) return;
    if (inStack.has(feature.id)) return;
    inStack.add(feature.id);
    for (const depId of feature.dependencies) {
      if (inStack.has(depId)) {
        warn(
          `[loader] Circular dependency: "${feature.id}" depends on "${depId}" which is already in the initialization stack — skipping`,
        );
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

  return result;
}

export async function loadFeatures(
  features: FeatureMeta[],
  options?: Partial<LoaderOptions>,
): Promise<void> {
  const warn: LogFn =
    options?.logging !== false
      ? (msg, ...args) => console.warn(msg, ...args)
      : () => {};

  let globalTimeout = options?.timeout ?? DEFAULT_TIMEOUT_MS;
  if (globalTimeout < 0) {
    warn(
      `[loader] Negative timeout (${globalTimeout}ms) is invalid — using default ${DEFAULT_TIMEOUT_MS}ms`,
    );
    globalTimeout = DEFAULT_TIMEOUT_MS;
  }

  const matched = matchFeatures(features, warn);
  if (!matched.length) return;

  const sorted = topoSort(matched, warn);

  const results = await Promise.allSettled(sorted.map((f) => f.load()));

  const readySet = new Set<string>();
  const resolvers = new Map<string, () => void>();

  const matchedIds = new Set(sorted.map((f) => f.id));
  const knownIds = new Set(features.map((f) => f.id));

  for (const feature of features) {
    if (!matchedIds.has(feature.id)) {
      readySet.add(feature.id);
    }
  }

  function markReady(id: string): void {
    readySet.add(id);
    const resolver = resolvers.get(id);
    if (resolver) {
      resolver();
      resolvers.delete(id);
    }
  }

  function waitForDependency(id: string): Promise<void> {
    if (readySet.has(id)) return Promise.resolve();
    return new Promise((resolve) => resolvers.set(id, resolve));
  }

  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    const { id, selectors, dependencies, timeout } = sorted[i]!;

    if (result.status === 'rejected') {
      warn(`[loader] Failed to load feature "${id}":`, result.reason);
      markReady(id);
      continue;
    }

    try {
      const effectiveTimeout = timeout ?? globalTimeout;

      if (dependencies.length && effectiveTimeout <= 0) {
        warn(
          `[loader] Feature "${id}" has dependencies but timeout is disabled — deadlock risk if circular`,
        );
      }

      const run = async (): Promise<void> => {
        if (dependencies.length) {
          const validDeps = [...new Set(dependencies)].filter((depId) => {
            if (!knownIds.has(depId)) {
              warn(
                `[loader] Feature "${id}" depends on unknown "${depId}" — ignoring`,
              );
              return false;
            }
            return true;
          });
          if (validDeps.length) {
            await Promise.all(validDeps.map(waitForDependency));
          }
        }

        await initFeature(result.value.default, selectors);
      };

      await withTimeout(run(), timeout, id, globalTimeout);
    } catch (err) {
      warn(`[loader] Feature "${id}" failed:`, err);
    }

    markReady(id);
  }
}
