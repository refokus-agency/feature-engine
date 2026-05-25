import { bench, describe } from 'vitest';
import { loadFeatures } from '../loader.ts';
import type { FeatureDescriptor, FeatureMeta } from '../types.ts';

function makeDescriptor(
  overrides: Partial<FeatureDescriptor> = {},
): FeatureDescriptor {
  return {
    id: 'test',
    selectors: [],
    priority: 0,
    global: false,
    dependencies: [],
    enabled: true,
    timeout: null,
    onSetup: null,
    onEach: null,
    onReady: null,
    ...overrides,
  };
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function buildFeatures(
  n: number,
  waves: number,
  delayMs: number,
): FeatureMeta[] {
  const features: FeatureMeta[] = [];
  for (let i = 0; i < n; i++) {
    const id = `f-${i}`;
    const priority = (i % waves) + 1;
    const descriptor = makeDescriptor({
      id,
      onSetup: () => delay(delayMs),
    });
    features.push({
      id,
      selectors: [],
      priority,
      global: true,
      dependencies: [],
      timeout: null,
      load: () => Promise.resolve({ default: descriptor }),
    });
  }
  return features;
}

function buildSequentialFeatures(n: number, delayMs: number): FeatureMeta[] {
  const features: FeatureMeta[] = [];
  for (let i = 0; i < n; i++) {
    const id = `f-${i}`;
    const descriptor = makeDescriptor({
      id,
      onSetup: () => delay(delayMs),
    });
    features.push({
      id,
      selectors: [],
      priority: i + 1,
      global: true,
      dependencies: [],
      timeout: null,
      load: () => Promise.resolve({ default: descriptor }),
    });
  }
  return features;
}

function buildWithDeps(
  perWave: number,
  waves: number,
  delayMs: number,
): FeatureMeta[] {
  const features: FeatureMeta[] = [];
  for (let w = 0; w < waves; w++) {
    for (let j = 0; j < perWave; j++) {
      const id = `f-w${w}-${j}`;
      const deps: string[] = [];
      if (w > 0) {
        deps.push(`f-w${w - 1}-${j}`);
      }
      const descriptor = makeDescriptor({
        id,
        onSetup: () => delay(delayMs),
      });
      features.push({
        id,
        selectors: [],
        priority: w + 1,
        global: true,
        dependencies: deps,
        timeout: null,
        load: () => Promise.resolve({ default: descriptor }),
      });
    }
  }
  return features;
}

const opts = { logging: false };

describe('loadFeatures — parallel vs sequential', () => {
  bench(
    'parallel: 10 features x 20ms, 1 wave',
    async () => {
      await loadFeatures(buildFeatures(10, 1, 20), opts);
    },
    { iterations: 5, warmupIterations: 1 },
  );

  bench(
    'sequential: 10 features x 20ms, 10 waves',
    async () => {
      await loadFeatures(buildSequentialFeatures(10, 20), opts);
    },
    { iterations: 5, warmupIterations: 1 },
  );

  bench(
    'parallel: 50 features x 10ms, 5 waves',
    async () => {
      await loadFeatures(buildFeatures(50, 5, 10), opts);
    },
    { iterations: 5, warmupIterations: 1 },
  );

  bench(
    'parallel with deps: 10/wave x 3 waves x 15ms',
    async () => {
      await loadFeatures(buildWithDeps(10, 3, 15), opts);
    },
    { iterations: 5, warmupIterations: 1 },
  );
});
