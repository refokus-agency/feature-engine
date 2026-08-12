import type { FeatureDescriptor, FeatureDescriptorInput } from './types.ts';

/**
 * Validates and freezes a feature descriptor.
 *
 * Lifecycle: `onSetup(selectors)` → `onEach({ el, index, elements, ctx })` → `onReady()`
 * For global features (`global: true`): `onSetup` → `onReady` only (`onEach` is not permitted).
 *
 * - `onSetup` runs once. Return `false` to abort; anything else becomes `ctx`.
 *   If omitted, `ctx` passed to `onEach` will be `undefined`.
 * - `onEach` runs per matched DOM element. Receives `{ el, index, elements, ctx }`.
 * - `onReady` runs after all `onEach` calls. Post-processing (e.g. `ScrollTrigger.refresh`).
 *
 * At least one of `onSetup` or `onEach` is required.
 *
 * @param descriptor - Feature descriptor.
 * @param descriptor.id - Unique feature identifier (non-empty string).
 * @param descriptor.selectors - CSS selectors to match. Empty `[]` for global features.
 * @param descriptor.priority - Lower values initialize first.
 * @param descriptor.global - If `true`, always loads regardless of DOM. Defaults to `false`.
 * @param descriptor.dependencies - IDs of features that must complete first. Defaults to `[]`, deduped.
 * @param descriptor.enabled - Whether the feature is active. Defaults to `true`.
 * @param descriptor.timeout - Max ms for lifecycle execution. Defaults to `null` (no limit).
 * @param descriptor.onSetup - Runs once with selectors. Return `false` to abort.
 * @param descriptor.onEach - Runs per matched element. Not allowed with `global: true`.
 * @param descriptor.onReady - Runs after all `onEach` calls.
 * @returns Frozen descriptor with normalized defaults: `global` → `false`, `dependencies` → deduped,
 *   `enabled` → `true`, `timeout` → `null`, hooks → `null`.
 * @throws If `id` is missing or not a string.
 * @throws If `selectors` is not an array of strings.
 * @throws If `priority` is not a finite number.
 * @throws If neither `onSetup` nor `onEach` are provided.
 * @throws If `global: true` is combined with `onEach`.
 * @throws If a hook is truthy but not a function.
 * @throws If `dependencies` is not a `string[]`, `enabled` is not a boolean, or `timeout` is not a positive number.
 */
export function defineFeature(
  descriptor: FeatureDescriptorInput,
): Readonly<FeatureDescriptor> {
  if (!descriptor.id || typeof descriptor.id !== 'string') {
    throw new Error('[defineFeature] id is required and must be a string');
  }

  if (
    !Array.isArray(descriptor.selectors) ||
    !descriptor.selectors.every((s) => typeof s === 'string')
  ) {
    throw new Error('[defineFeature] selectors must be an array of strings');
  }

  if (
    typeof descriptor.priority !== 'number' ||
    !Number.isFinite(descriptor.priority)
  ) {
    throw new Error(
      '[defineFeature] priority is required and must be a finite number',
    );
  }

  const hasSetup = typeof descriptor.onSetup === 'function';
  const hasEach = typeof descriptor.onEach === 'function';

  if (!hasSetup && !hasEach) {
    throw new Error(
      '[defineFeature] at least one of onSetup or onEach is required',
    );
  }

  if (descriptor.global === true && hasEach) {
    throw new Error(
      '[defineFeature] global features cannot use onEach (no selectors to match)',
    );
  }

  if (descriptor.onSetup && !hasSetup) {
    throw new Error('[defineFeature] onSetup must be a function');
  }

  if (descriptor.onEach && !hasEach) {
    throw new Error('[defineFeature] onEach must be a function');
  }

  if (descriptor.onReady && typeof descriptor.onReady !== 'function') {
    throw new Error('[defineFeature] onReady must be a function');
  }

  if (descriptor.expose && typeof descriptor.expose !== 'function') {
    throw new Error('[defineFeature] expose must be a function');
  }

  if (
    descriptor.dependencies !== undefined &&
    (!Array.isArray(descriptor.dependencies) ||
      !descriptor.dependencies.every((d) => typeof d === 'string'))
  ) {
    throw new Error('[defineFeature] dependencies must be an array of strings');
  }

  if (
    descriptor.enabled !== undefined &&
    typeof descriptor.enabled !== 'boolean'
  ) {
    throw new Error('[defineFeature] enabled must be a boolean');
  }

  if (
    descriptor.timeout !== undefined &&
    descriptor.timeout !== null &&
    (typeof descriptor.timeout !== 'number' || descriptor.timeout <= 0)
  ) {
    throw new Error('[defineFeature] timeout must be a positive number (ms)');
  }

  return Object.freeze({
    id: descriptor.id,
    selectors: Object.freeze([...descriptor.selectors]),
    priority: descriptor.priority,
    global: descriptor.global === true,
    dependencies: Object.freeze([...new Set(descriptor.dependencies || [])]),
    enabled: descriptor.enabled !== false,
    timeout: descriptor.timeout ?? null,
    onSetup: descriptor.onSetup || null,
    onEach: descriptor.onEach || null,
    onReady: descriptor.onReady || null,
    expose: descriptor.expose || null,
  });
}
