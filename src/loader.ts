import type { FeatureDescriptor, FeatureMeta, LoaderOptions } from './types.ts';

const DEFAULT_TIMEOUT_MS = 10_000;

type LogFn = (...args: unknown[]) => void;

interface MatchedFeature {
  meta: FeatureMeta;
  validSelectors: string[];
}

function matchFeatures(features: FeatureMeta[], warn: LogFn): MatchedFeature[] {
  const matched: MatchedFeature[] = [];

  for (const feature of features) {
    if (feature.global) {
      matched.push({ meta: feature, validSelectors: [...feature.selectors] });
      continue;
    }

    const validSelectors: string[] = [];
    let found = false;
    for (const selector of feature.selectors) {
      try {
        if (document.querySelector(selector)) {
          found = true;
        }
        validSelectors.push(selector);
      } catch {
        warn(
          `[loader] Invalid CSS selector "${selector}" in feature "${feature.id}" — skipping`,
        );
      }
    }

    if (found) {
      matched.push({ meta: feature, validSelectors });
    }
  }

  matched.sort((a, b) => a.meta.priority - b.meta.priority);
  return matched;
}

function topoSort(matched: MatchedFeature[], warn: LogFn): MatchedFeature[] {
  const idToEntry = new Map(matched.map((entry) => [entry.meta.id, entry]));
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const result: MatchedFeature[] = [];

  function visit(entry: MatchedFeature): void {
    if (visited.has(entry.meta.id)) return;
    if (inStack.has(entry.meta.id)) {
      warn(
        `[loader] Circular dependency detected involving "${entry.meta.id}" — skipping`,
      );
      return;
    }
    inStack.add(entry.meta.id);
    for (const depId of entry.meta.dependencies || []) {
      const dep = idToEntry.get(depId);
      if (dep) visit(dep);
    }
    inStack.delete(entry.meta.id);
    visited.add(entry.meta.id);
    result.push(entry);
  }

  for (const entry of matched) {
    visit(entry);
  }

  return result;
}

function withTimeout<T>(promise: Promise<T>, ms: number, id: string): Promise<T> {
  if (ms <= 0) return promise;

  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`[loader] Feature "${id}" timed out after ${ms}ms`)),
        ms,
      );
    }),
  ]);
}

async function initFeature(
  feature: FeatureDescriptor,
  selectors: string[],
): Promise<void> {
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

export async function loadFeatures(
  features: FeatureMeta[],
  options?: Partial<LoaderOptions>,
): Promise<void> {
  const opts: LoaderOptions = {
    timeout: DEFAULT_TIMEOUT_MS,
    logging: true,
    ...options,
  };

  const warn: LogFn = opts.logging
    ? (...args) => console.warn(...args)
    : () => {};

  const matched = matchFeatures(features, warn);
  if (!matched.length) return;

  const sorted = topoSort(matched, warn);

  const results = await Promise.allSettled(
    sorted.map((entry) => entry.meta.load()),
  );

  const readySet = new Set<string>();
  const resolvers = new Map<string, () => void>();

  const matchedIds = new Set(sorted.map((entry) => entry.meta.id));
  const knownIds = new Set(features.map((f) => f.id));

  for (const feature of features) {
    if (!matchedIds.has(feature.id)) {
      readySet.add(feature.id);
    }
  }

  function markReady(id: string): void {
    readySet.add(id);
    if (resolvers.has(id)) {
      resolvers.get(id)!();
      resolvers.delete(id);
    }
  }

  function waitForDependency(id: string): Promise<void> {
    if (readySet.has(id)) return Promise.resolve();
    return new Promise<void>((resolve) => resolvers.set(id, resolve));
  }

  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    const entry = sorted[i]!;
    const { id, dependencies, timeout } = entry.meta;
    const { validSelectors } = entry;
    const effectiveTimeout = timeout ?? opts.timeout;

    if (result.status === 'rejected') {
      warn(`[loader] Failed to load feature "${id}":`, result.reason);
      markReady(id);
      continue;
    }

    try {
      if (dependencies?.length) {
        const validDeps = ([...new Set(dependencies)] as string[]).filter(
          (depId) => {
            if (!knownIds.has(depId)) {
              warn(
                `[loader] Feature "${id}" depends on unknown "${depId}" — ignoring`,
              );
              return false;
            }
            return true;
          },
        );
        if (validDeps.length) {
          await withTimeout(
            Promise.all(validDeps.map(waitForDependency)),
            effectiveTimeout,
            id,
          );
        }
      }

      await withTimeout(
        initFeature(result.value.default, validSelectors),
        effectiveTimeout,
        id,
      );
    } catch (err) {
      warn(`[loader] Feature "${id}" failed:`, err);
    }

    markReady(id);
  }
}
