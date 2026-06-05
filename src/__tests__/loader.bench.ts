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
    expose: null,
    ...overrides,
  };
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function buildFeatures(opts: {
  count: number;
  waves: number;
  delayMs: number;
}): FeatureMeta[] {
  const { count, waves, delayMs } = opts;
  const features: FeatureMeta[] = [];
  for (let i = 0; i < count; i++) {
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

function buildSequentialFeatures(opts: {
  count: number;
  delayMs: number;
}): FeatureMeta[] {
  const { count, delayMs } = opts;
  const features: FeatureMeta[] = [];
  for (let i = 0; i < count; i++) {
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

function buildWithDeps(opts: {
  perWave: number;
  waves: number;
  delayMs: number;
}): FeatureMeta[] {
  const { perWave, waves, delayMs } = opts;
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
      await loadFeatures(buildFeatures({ count: 10, waves: 1, delayMs: 20 }), opts);
    },
    { iterations: 5, warmupIterations: 1 },
  );

  bench(
    'sequential: 10 features x 20ms, 10 waves',
    async () => {
      await loadFeatures(buildSequentialFeatures({ count: 10, delayMs: 20 }), opts);
    },
    { iterations: 5, warmupIterations: 1 },
  );

  bench(
    'parallel: 50 features x 10ms, 5 waves',
    async () => {
      await loadFeatures(buildFeatures({ count: 50, waves: 5, delayMs: 10 }), opts);
    },
    { iterations: 5, warmupIterations: 1 },
  );

  bench(
    'parallel with deps: 10/wave x 3 waves x 15ms',
    async () => {
      await loadFeatures(buildWithDeps({ perWave: 10, waves: 3, delayMs: 15 }), opts);
    },
    { iterations: 5, warmupIterations: 1 },
  );
});
