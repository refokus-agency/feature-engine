import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadFeatures } from '../loader.ts';
import type { FeatureDescriptor, FeatureMeta } from '../types.ts';

const noop = () => {};

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

function makeMeta(overrides: Partial<FeatureMeta> = {}): FeatureMeta {
  const descriptor = makeDescriptor({ id: overrides.id ?? 'test' });
  return {
    id: 'test',
    selectors: [],
    priority: 0,
    global: false,
    dependencies: [],
    timeout: null,
    load: () => Promise.resolve({ default: descriptor }),
    ...overrides,
  };
}

interface ExecutionEntry {
  id: string;
  start: number;
  end: number;
  blockedBy?: string;
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function makeDelayedLoadable(
  id: string,
  delayMs: number,
  log: ExecutionEntry[],
  meta: Partial<FeatureMeta> = {},
): FeatureMeta {
  const descriptor = makeDescriptor({
    id,
    onSetup: async () => {
      const start = performance.now();
      await delay(delayMs);
      const end = performance.now();
      log.push({ id, start, end });
    },
  });
  return makeMeta({
    id,
    global: true,
    load: () => Promise.resolve({ default: descriptor }),
    ...meta,
  });
}

function formatLog(log: ExecutionEntry[]): string {
  return log.map((e) => `${e.id}(${(e.end - e.start).toFixed(0)}ms${e.blockedBy ? ` blocked-by:${e.blockedBy}` : ''})`).join(', ');
}

describe('loadFeatures — smoke tests', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('3 waves x 3 features x 50ms — total time ~ 150ms, not 450ms', async () => {
    vi.spyOn(console, 'warn').mockImplementation(noop);
    const log: ExecutionEntry[] = [];
    const features = [
      makeDelayedLoadable('w1-a', 50, log, { priority: 1 }),
      makeDelayedLoadable('w1-b', 50, log, { priority: 1 }),
      makeDelayedLoadable('w1-c', 50, log, { priority: 1 }),
      makeDelayedLoadable('w2-a', 50, log, { priority: 2 }),
      makeDelayedLoadable('w2-b', 50, log, { priority: 2 }),
      makeDelayedLoadable('w2-c', 50, log, { priority: 2 }),
      makeDelayedLoadable('w3-a', 50, log, { priority: 3 }),
      makeDelayedLoadable('w3-b', 50, log, { priority: 3 }),
      makeDelayedLoadable('w3-c', 50, log, { priority: 3 }),
    ];

    const t0 = performance.now();
    await loadFeatures(features, { logging: false });
    const elapsed = performance.now() - t0;

    const sequentialTime = 9 * 50;
    expect(log, `only ${log.length}/9 features ran: ${formatLog(log)}`).toHaveLength(9);

    const w1 = log.filter((e) => e.id.startsWith('w1-'));
    const w2 = log.filter((e) => e.id.startsWith('w2-'));
    const maxW1End = Math.max(...w1.map((e) => e.end));
    const minW2Start = Math.min(...w2.map((e) => e.start));
    expect(
      minW2Start,
      `wave 2 started at ${minW2Start.toFixed(0)} before wave 1 ended at ${maxW1End.toFixed(0)}`,
    ).toBeGreaterThanOrEqual(maxW1End - 10);

    expect(
      elapsed,
      `elapsed=${elapsed.toFixed(0)}ms, expected<${(sequentialTime * 0.75).toFixed(0)}ms; order: ${formatLog(log)}`,
    ).toBeLessThan(sequentialTime * 0.75);
  });

  it('1 slow feature (200ms) does not block same-wave peers', async () => {
    vi.spyOn(console, 'warn').mockImplementation(noop);

    let slowStarted = false;
    let slowFinished = false;
    const fastTimings: Array<{ id: string; slowState: string }> = [];

    const slowDescriptor = makeDescriptor({
      id: 'slow',
      onSetup: async () => {
        slowStarted = true;
        await delay(200);
        slowFinished = true;
      },
    });
    const slow = makeMeta({
      id: 'slow',
      global: true,
      priority: 1,
      load: () => Promise.resolve({ default: slowDescriptor }),
    });

    const makeFastPeer = (id: string) => {
      const desc = makeDescriptor({
        id,
        onSetup: async () => {
          await delay(10);
          fastTimings.push({
            id,
            slowState: slowStarted
              ? slowFinished
                ? 'finished'
                : 'running'
              : 'not-started',
          });
        },
      });
      return makeMeta({
        id,
        global: true,
        priority: 1,
        load: () => Promise.resolve({ default: desc }),
      });
    };

    const features = [slow, makeFastPeer('fast-a'), makeFastPeer('fast-b')];

    const t0 = performance.now();
    await loadFeatures(features, { logging: false });
    const elapsed = performance.now() - t0;

    expect(fastTimings).toHaveLength(2);
    for (const timing of fastTimings) {
      expect(
        timing.slowState,
        `${timing.id} saw slow as '${timing.slowState}', expected 'running'`,
      ).toBe('running');
    }
    expect(
      elapsed,
      `elapsed=${elapsed.toFixed(0)}ms, expected<350ms`,
    ).toBeLessThan(350);
  });

  it('cross-wave dependency: dependent waits for previous wave, peers run concurrently', async () => {
    vi.spyOn(console, 'warn').mockImplementation(noop);
    const log: ExecutionEntry[] = [];

    // Wave 1: A (100ms) and C (10ms) run concurrently
    // Wave 2: B (50ms, depends on A) — B runs only after wave 1 completes
    // Wave 2: D (50ms, no deps) — D also runs after wave 1 (same wave as B)
    const features = [
      makeDelayedLoadable('A', 100, log, { priority: 1 }),
      makeDelayedLoadable('C', 10, log, { priority: 1 }),
      makeDelayedLoadable('B', 50, log, { priority: 2, dependencies: ['A'] }),
      makeDelayedLoadable('D', 50, log, { priority: 2 }),
    ];

    const t0 = performance.now();
    await loadFeatures(features, { logging: false });
    const elapsed = performance.now() - t0;

    const entryA = log.find((e) => e.id === 'A')!;
    const entryB = log.find((e) => e.id === 'B')!;
    const entryC = log.find((e) => e.id === 'C')!;
    const entryD = log.find((e) => e.id === 'D')!;

    expect(entryA, 'feature A did not execute').toBeDefined();
    expect(entryB, 'feature B did not execute').toBeDefined();
    expect(entryC, 'feature C did not execute').toBeDefined();
    expect(entryD, 'feature D did not execute').toBeDefined();

    entryB.blockedBy = 'A';

    // C (10ms) finishes well before A (100ms) — proves wave-1 concurrency
    expect(
      entryC.end,
      `C ended at ${entryC.end.toFixed(0)} but A ended at ${entryA.end.toFixed(0)} — C (10ms) should finish before A (100ms) in same wave`,
    ).toBeLessThan(entryA.end);

    // B starts only after wave 1 finishes (A is the bottleneck)
    expect(
      entryB.start,
      `B started at ${entryB.start.toFixed(0)} before A ended at ${entryA.end.toFixed(0)} — B depends on A and is in wave 2`,
    ).toBeGreaterThanOrEqual(entryA.end - 10);

    // B and D run concurrently in wave 2
    expect(
      Math.abs(entryB.start - entryD.start),
      `B and D should start near-simultaneously in wave 2 (diff=${Math.abs(entryB.start - entryD.start).toFixed(0)}ms)`,
    ).toBeLessThan(10);

    // Total: ~100ms (wave 1 bottleneck) + ~50ms (wave 2) = ~150ms
    expect(
      elapsed,
      `elapsed=${elapsed.toFixed(0)}ms, expected<250ms; ${formatLog(log)}`,
    ).toBeLessThan(250);
  });

  it('chunk-load failure cascade — skipped features do not add delay', async () => {
    vi.spyOn(console, 'warn').mockImplementation(noop);
    const log: ExecutionEntry[] = [];

    const bSetup = vi.fn();
    const cSetup = vi.fn();

    const featureA: FeatureMeta = makeMeta({
      id: 'A',
      global: true,
      priority: 1,
      load: () => {
        const start = performance.now();
        return delay(100).then(() => {
          log.push({ id: 'A', start, end: performance.now() });
          return Promise.reject(new Error('chunk 404'));
        });
      },
    });

    const bDesc = makeDescriptor({ id: 'B', onSetup: bSetup });
    const featureB = makeMeta({
      id: 'B',
      global: true,
      priority: 2,
      dependencies: ['A'],
      load: () => Promise.resolve({ default: bDesc }),
    });

    const cDesc = makeDescriptor({ id: 'C', onSetup: cSetup });
    const featureC = makeMeta({
      id: 'C',
      global: true,
      priority: 3,
      dependencies: ['B'],
      load: () => Promise.resolve({ default: cDesc }),
    });

    const featureD = makeDelayedLoadable('D', 200, log, { priority: 1 });

    const t0 = performance.now();
    await loadFeatures([featureA, featureB, featureC, featureD], {
      logging: false,
    });
    const elapsed = performance.now() - t0;

    expect(bSetup, 'B should be skipped — dependency A failed').not.toHaveBeenCalled();
    expect(cSetup, 'C should be skipped — dependency chain A→B failed').not.toHaveBeenCalled();

    expect(log.find((e) => e.id === 'D'), 'D (independent) should complete normally').toBeDefined();

    expect(
      elapsed,
      `elapsed=${elapsed.toFixed(0)}ms, expected<350ms; ${formatLog(log)}`,
    ).toBeLessThan(350);
  });

  it('mixed DOM-selector + global features with varying delays', async () => {
    vi.spyOn(console, 'warn').mockImplementation(noop);
    document.body.innerHTML = '<div data-matched></div>';

    const log: ExecutionEntry[] = [];

    const matchedDesc = makeDescriptor({
      id: 'dom-matched',
      selectors: ['[data-matched]'],
      onSetup: async () => {
        const start = performance.now();
        await delay(30);
        log.push({ id: 'dom-matched', start, end: performance.now() });
      },
    });
    const matched = makeMeta({
      id: 'dom-matched',
      selectors: ['[data-matched]'],
      priority: 1,
      load: () => Promise.resolve({ default: matchedDesc }),
    });

    const unmatchedSetup = vi.fn();
    const unmatchedDesc = makeDescriptor({
      id: 'dom-unmatched',
      selectors: ['[data-nope]'],
      onSetup: unmatchedSetup,
    });
    const unmatched = makeMeta({
      id: 'dom-unmatched',
      selectors: ['[data-nope]'],
      priority: 1,
      load: () => Promise.resolve({ default: unmatchedDesc }),
    });

    const globalA = makeDelayedLoadable('global-a', 80, log, { priority: 1 });
    const globalB = makeDelayedLoadable('global-b', 80, log, { priority: 2 });

    const t0 = performance.now();
    await loadFeatures([matched, unmatched, globalA, globalB], {
      logging: false,
    });
    const elapsed = performance.now() - t0;

    expect(unmatchedSetup, 'unmatched DOM feature should not run').not.toHaveBeenCalled();

    expect(log.find((e) => e.id === 'dom-matched'), 'matched DOM feature should run').toBeDefined();
    expect(log.find((e) => e.id === 'global-a'), 'global-a should run').toBeDefined();
    expect(log.find((e) => e.id === 'global-b'), 'global-b should run').toBeDefined();

    expect(
      elapsed,
      `elapsed=${elapsed.toFixed(0)}ms, expected<250ms; ${formatLog(log)}`,
    ).toBeLessThan(250);
  });

  it('large graph: 50 features, 5 waves, staggered delays — proves parallelism', async () => {
    vi.spyOn(console, 'warn').mockImplementation(noop);
    const log: ExecutionEntry[] = [];

    const waveMaxes = new Map<number, number>();
    const features: FeatureMeta[] = [];
    for (let i = 0; i < 50; i++) {
      const wave = (i % 5) + 1;
      const delayMs = ((i * 7 + 13) % 90) + 10;
      waveMaxes.set(wave, Math.max(waveMaxes.get(wave) ?? 0, delayMs));
      features.push(makeDelayedLoadable(`f-${i}`, delayMs, log, { priority: wave }));
    }

    const parallelBound = [...waveMaxes.values()].reduce((a, b) => a + b, 0);

    const t0 = performance.now();
    await loadFeatures(features, { logging: false });
    const elapsed = performance.now() - t0;

    expect(
      log,
      `only ${log.length}/50 features ran`,
    ).toHaveLength(50);

    const upperBound = parallelBound * 3;
    expect(
      elapsed,
      `elapsed=${elapsed.toFixed(0)}ms, expected<${upperBound.toFixed(0)}ms (parallelBound=${parallelBound}ms × 3); ${log.length} features ran`,
    ).toBeLessThan(upperBound);
  });

  it('parallel dispatch is at least 3x faster than sequential', async () => {
    vi.spyOn(console, 'warn').mockImplementation(noop);

    const makeFeatureSet = (singleWave: boolean) => {
      const features: FeatureMeta[] = [];
      for (let i = 0; i < 10; i++) {
        const id = `f-${i}`;
        const descriptor = makeDescriptor({
          id,
          onSetup: () => delay(20),
        });
        features.push(makeMeta({
          id,
          global: true,
          priority: singleWave ? 1 : i + 1,
          load: () => Promise.resolve({ default: descriptor }),
        }));
      }
      return features;
    };

    const t0 = performance.now();
    await loadFeatures(makeFeatureSet(true), { logging: false });
    const parallelMs = performance.now() - t0;

    const t1 = performance.now();
    await loadFeatures(makeFeatureSet(false), { logging: false });
    const seqMs = performance.now() - t1;

    expect(
      parallelMs * 3,
      `parallel=${parallelMs.toFixed(0)}ms, sequential=${seqMs.toFixed(0)}ms — expected parallel to be ≥3x faster`,
    ).toBeLessThan(seqMs);
  });
});
