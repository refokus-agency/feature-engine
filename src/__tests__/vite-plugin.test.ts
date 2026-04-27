import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { parseFeatureFile } from '../vite/parse-feature-file.ts';
import { featureMetadataPlugin } from '../vite/index.ts';

beforeEach(() => {
  vi.restoreAllMocks();
});

const TMP_ROOT = resolve(tmpdir(), 'vite-plugin-test-' + process.pid);

function featureSource(props: string): string {
  return `import { defineFeature } from '@refokus-agency/feature-engine';\nexport default defineFeature({\n${props}\n});\n`;
}

const VALID_FEATURE = featureSource(`
  id: "test-feature",
  selectors: ["[data-test]"],
  priority: 10,
  onSetup() {}
`);

describe('parseFeatureFile', () => {
  describe('valid feature files', () => {
    it('extracts all metadata from a valid feature file', () => {
      const result = parseFeatureFile(VALID_FEATURE, 'test.feature.js');
      expect(result).toEqual({
        id: 'test-feature',
        selectors: ['[data-test]'],
        priority: 10,
        global: false,
        dependencies: [],
        timeout: null,
        enabled: true,
      });
    });

    it('extracts all optional fields when present', () => {
      const source = featureSource(`
        id: "full-feature",
        selectors: ["[data-a]", "[data-b]"],
        priority: 5,
        global: true,
        dependencies: ["dep-a", "dep-b"],
        timeout: 3000,
        enabled: true,
        onSetup() {}
      `);
      const result = parseFeatureFile(source, 'full.feature.js');
      expect(result).toEqual({
        id: 'full-feature',
        selectors: ['[data-a]', '[data-b]'],
        priority: 5,
        global: true,
        dependencies: ['dep-a', 'dep-b'],
        timeout: 3000,
        enabled: true,
      });
    });

    it('handles negative priority numbers', () => {
      const source = featureSource(`
        id: "neg-priority",
        selectors: ["[data-x]"],
        priority: -1,
        onSetup() {}
      `);
      const result = parseFeatureFile(source, 'neg.feature.js');
      expect(result).not.toBeNull();
      expect(result!.priority).toBe(-1);
    });

    it('handles onEach instead of onSetup', () => {
      const source = featureSource(`
        id: "each-only",
        selectors: ["[data-x]"],
        priority: 1,
        onEach({ el }) {}
      `);
      const result = parseFeatureFile(source, 'each.feature.js');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('each-only');
    });

    it('handles both onSetup and onEach', () => {
      const source = featureSource(`
        id: "both-hooks",
        selectors: ["[data-x]"],
        priority: 1,
        onSetup() {},
        onEach({ el }) {}
      `);
      const result = parseFeatureFile(source, 'both.feature.js');
      expect(result).not.toBeNull();
    });

    it('defaults global to false when not present', () => {
      const result = parseFeatureFile(VALID_FEATURE, 'test.feature.js');
      expect(result!.global).toBe(false);
    });

    it('defaults dependencies to empty array when not present', () => {
      const result = parseFeatureFile(VALID_FEATURE, 'test.feature.js');
      expect(result!.dependencies).toEqual([]);
    });

    it('defaults timeout to null when not present', () => {
      const result = parseFeatureFile(VALID_FEATURE, 'test.feature.js');
      expect(result!.timeout).toBeNull();
    });

    it('defaults enabled to true when not present', () => {
      const result = parseFeatureFile(VALID_FEATURE, 'test.feature.js');
      expect(result!.enabled).toBe(true);
    });

    it('handles float timeout literal', () => {
      const source = featureSource(`
        id: "float-timeout",
        selectors: ["[data-x]"],
        priority: 1,
        timeout: 1.5,
        onSetup() {}
      `);
      const result = parseFeatureFile(source, 'float.feature.js');
      expect(result).not.toBeNull();
      expect(result!.timeout).toBe(1.5);
    });

    it('parses enabled: false', () => {
      const source = featureSource(`
        id: "disabled",
        selectors: ["[data-x]"],
        priority: 1,
        enabled: false,
        onSetup() {}
      `);
      const result = parseFeatureFile(source, 'disabled.feature.js');
      expect(result).not.toBeNull();
      expect(result!.enabled).toBe(false);
    });
  });

  describe('error handling', () => {
    it('returns null for syntax errors', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = parseFeatureFile('export default {{{', 'bad.feature.js');
      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse'),
      );
    });

    it('returns null when no defineFeature call exists', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const source = 'export default { id: "nope" };\n';
      const result = parseFeatureFile(source, 'no-call.feature.js');
      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('No valid defineFeature()'),
      );
    });

    it('returns null when defineFeature is not export default', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const source = `import { defineFeature } from '@refokus-agency/feature-engine';\ndefineFeature({ id: "bare", selectors: [], priority: 1, onSetup() {} });\n`;
      const result = parseFeatureFile(source, 'bare.feature.js');
      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('No valid defineFeature()'),
      );
    });

    it('returns null when required field id is missing', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const source = featureSource(`
        selectors: ["[data-x]"],
        priority: 1,
        onSetup() {}
      `);
      const result = parseFeatureFile(source, 'no-id.feature.js');
      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Missing required field "id"'),
      );
    });

    it('returns null when required field selectors is missing', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const source = featureSource(`
        id: "no-sel",
        priority: 1,
        onSetup() {}
      `);
      const result = parseFeatureFile(source, 'no-sel.feature.js');
      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Missing required field "selectors"'),
      );
    });

    it('returns null when required field priority is missing', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const source = featureSource(`
        id: "no-prio",
        selectors: ["[data-x]"],
        onSetup() {}
      `);
      const result = parseFeatureFile(source, 'no-prio.feature.js');
      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Missing required field "priority"'),
      );
    });

    it('returns null when neither onSetup nor onEach is present', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const source = featureSource(`
        id: "no-hooks",
        selectors: ["[data-x]"],
        priority: 1
      `);
      const result = parseFeatureFile(source, 'no-hooks.feature.js');
      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('No onSetup or onEach'),
      );
    });

    it('returns null for non-literal id value', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const source = `const name = "dynamic";\nexport default defineFeature({\n  id: name,\n  selectors: ["[data-x]"],\n  priority: 1,\n  onSetup() {}\n});\n`;
      const result = parseFeatureFile(source, 'dynamic-id.feature.js');
      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Non-literal value for "id"'),
      );
    });

    it('returns null for non-literal selectors (variable reference)', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const source = `const sels = ["[data-x]"];\nexport default defineFeature({\n  id: "spread",\n  selectors: sels,\n  priority: 1,\n  onSetup() {}\n});\n`;
      const result = parseFeatureFile(source, 'spread.feature.js');
      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Non-literal value for "selectors"'),
      );
    });

    it('returns null for non-boolean enabled', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const source = featureSource(`
        id: "bad-enabled",
        selectors: ["[data-x]"],
        priority: 1,
        enabled: 1,
        onSetup() {}
      `);
      const result = parseFeatureFile(source, 'bad-enabled.feature.js');
      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('"enabled" must be a boolean'),
      );
    });

    it('returns null for non-positive timeout', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const source = featureSource(`
        id: "bad-timeout",
        selectors: ["[data-x]"],
        priority: 1,
        timeout: -100,
        onSetup() {}
      `);
      const result = parseFeatureFile(source, 'bad-timeout.feature.js');
      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('"timeout" must be a positive number'),
      );
    });

    it('returns null for zero timeout', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const source = featureSource(`
        id: "zero-timeout",
        selectors: ["[data-x]"],
        priority: 1,
        timeout: 0,
        onSetup() {}
      `);
      const result = parseFeatureFile(source, 'zero-timeout.feature.js');
      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('"timeout" must be a positive number'),
      );
    });

    it('skips computed properties', () => {
      const source = `const key = "id";\nexport default defineFeature({\n  [key]: "computed",\n  id: "real",\n  selectors: ["[data-x]"],\n  priority: 1,\n  onSetup() {}\n});\n`;
      const result = parseFeatureFile(source, 'computed.feature.js');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('real');
    });

    it('returns null for empty source', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = parseFeatureFile('', 'empty.feature.js');
      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('No valid defineFeature()'),
      );
    });

    it('returns null for non-numeric priority', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const source = featureSource(`
        id: "str-priority",
        selectors: ["[data-x]"],
        priority: "high",
        onSetup() {}
      `);
      const result = parseFeatureFile(source, 'str-priority.feature.js');
      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('"priority" must be a numeric literal'),
      );
    });

    it('returns null for non-boolean global', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const source = featureSource(`
        id: "str-global",
        selectors: ["[data-x]"],
        priority: 1,
        global: "yes",
        onSetup() {}
      `);
      const result = parseFeatureFile(source, 'str-global.feature.js');
      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('"global" must be a boolean literal'),
      );
    });

    it('returns null for null literal in required field', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const source = featureSource(`
        id: null,
        selectors: ["[data-x]"],
        priority: 1,
        onSetup() {}
      `);
      const result = parseFeatureFile(source, 'null-id.feature.js');
      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalled();
    });

    it('rejects non-string elements in selectors array', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const source = featureSource(`
        id: "num-sel",
        selectors: [1, true],
        priority: 1,
        onSetup() {}
      `);
      const result = parseFeatureFile(source, 'num-sel.feature.js');
      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Non-literal value for "selectors"'),
      );
    });

    it('parses explicit empty dependencies array', () => {
      const source = featureSource(`
        id: "empty-deps",
        selectors: ["[data-x]"],
        priority: 1,
        dependencies: [],
        onSetup() {}
      `);
      const result = parseFeatureFile(source, 'empty-deps.feature.js');
      expect(result).not.toBeNull();
      expect(result!.dependencies).toEqual([]);
    });

    it('handles string-keyed properties (quoted keys)', () => {
      const source = `import { defineFeature } from '@refokus-agency/feature-engine';\nexport default defineFeature({\n  "id": "quoted-key",\n  "selectors": ["[data-x]"],\n  "priority": 1,\n  onSetup() {}\n});\n`;
      const result = parseFeatureFile(source, 'quoted.feature.js');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('quoted-key');
    });

    it('rejects non-string elements in dependencies array', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const source = featureSource(`
        id: "num-deps",
        selectors: ["[data-x]"],
        priority: 1,
        dependencies: [42],
        onSetup() {}
      `);
      const result = parseFeatureFile(source, 'num-deps.feature.js');
      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Non-literal value for "dependencies"'),
      );
    });
  });
});

describe('featureMetadataPlugin', () => {
  it('exports featureMetadataPlugin function', () => {
    expect(typeof featureMetadataPlugin).toBe('function');
  });

  it('returns a Plugin object with correct name', () => {
    const plugin = featureMetadataPlugin();
    expect(plugin.name).toBe('feature-metadata');
  });

  it('resolves virtual:feature-metadata to internal id', () => {
    const plugin = featureMetadataPlugin();
    const resolveId = plugin.resolveId as Function;
    expect(resolveId.call({}, 'virtual:feature-metadata')).toBe(
      '\0virtual:feature-metadata',
    );
  });

  it('returns undefined for non-virtual module ids', () => {
    const plugin = featureMetadataPlugin();
    const resolveId = plugin.resolveId as Function;
    expect(resolveId.call({}, 'some-other-module')).toBeUndefined();
  });

  it('accepts include option without error', () => {
    const plugin = featureMetadataPlugin({ include: 'widgets/**/*.feature.js' });
    expect(plugin.name).toBe('feature-metadata');
  });

  it('throws if load is called before configResolved', () => {
    const plugin = featureMetadataPlugin();
    const load = plugin.load as Function;
    expect(() => load.call({}, '\0virtual:feature-metadata')).toThrow(
      'configResolved has not been called yet',
    );
  });

  it('returns undefined from load for non-virtual module ids', () => {
    const plugin = featureMetadataPlugin();
    (plugin.configResolved as Function).call({}, { root: TMP_ROOT });
    const result = (plugin.load as Function).call({}, 'some-regular-module');
    expect(result).toBeUndefined();
  });

  describe('handleHotUpdate', () => {
    it('invalidates virtual module for .feature.js file changes', () => {
      const plugin = featureMetadataPlugin();
      const handleHotUpdate = plugin.handleHotUpdate as Function;
      const mockMod = { id: '\0virtual:feature-metadata' };
      const mockServer = {
        moduleGraph: {
          getModuleById: vi.fn(() => mockMod),
          invalidateModule: vi.fn(),
        },
      };

      const result = handleHotUpdate.call({}, {
        file: '/src/features/hero.feature.js',
        server: mockServer,
      });

      expect(mockServer.moduleGraph.getModuleById).toHaveBeenCalledWith('\0virtual:feature-metadata');
      expect(mockServer.moduleGraph.invalidateModule).toHaveBeenCalledWith(mockMod);
      expect(result).toEqual([mockMod]);
    });

    it('returns undefined for non-.feature.js file changes', () => {
      const plugin = featureMetadataPlugin();
      const handleHotUpdate = plugin.handleHotUpdate as Function;
      const mockServer = {
        moduleGraph: {
          getModuleById: vi.fn(),
          invalidateModule: vi.fn(),
        },
      };

      const result = handleHotUpdate.call({}, {
        file: '/src/components/Button.tsx',
        server: mockServer,
      });

      expect(result).toBeUndefined();
      expect(mockServer.moduleGraph.getModuleById).not.toHaveBeenCalled();
    });

    it('returns undefined when virtual module is not in module graph', () => {
      const plugin = featureMetadataPlugin();
      const handleHotUpdate = plugin.handleHotUpdate as Function;
      const mockServer = {
        moduleGraph: {
          getModuleById: vi.fn(() => undefined),
          invalidateModule: vi.fn(),
        },
      };

      const result = handleHotUpdate.call({}, {
        file: '/src/features/hero.feature.js',
        server: mockServer,
      });

      expect(result).toBeUndefined();
      expect(mockServer.moduleGraph.invalidateModule).not.toHaveBeenCalled();
    });
  });

  describe('load hook integration', () => {
    function setupFixture(name: string, files: Record<string, string>): string {
      const root = resolve(TMP_ROOT, name);
      const featuresDir = resolve(root, 'src', 'features');
      mkdirSync(featuresDir, { recursive: true });
      for (const [fileName, content] of Object.entries(files)) {
        writeFileSync(resolve(featuresDir, fileName), content, 'utf-8');
      }
      return root;
    }

    afterAll(() => {
      try { rmSync(TMP_ROOT, { recursive: true, force: true }); } catch {}
    });

    it('generates empty array when no feature files exist', () => {
      const root = resolve(TMP_ROOT, 'empty');
      mkdirSync(resolve(root, 'src', 'features'), { recursive: true });

      const plugin = featureMetadataPlugin();
      (plugin.configResolved as Function).call({}, { root });

      const result = (plugin.load as Function).call({}, '\0virtual:feature-metadata');
      expect(result).toBe('export default [\n\n];\n');
    });

    it('skips duplicate feature IDs', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const root = setupFixture('dupe', {
        'a.feature.js': featureSource(`id: "dupe", selectors: ["[data-a]"], priority: 1, onSetup() {}`),
        'b.feature.js': featureSource(`id: "dupe", selectors: ["[data-b]"], priority: 2, onSetup() {}`),
      });

      const plugin = featureMetadataPlugin();
      (plugin.configResolved as Function).call({}, { root });

      const result = (plugin.load as Function).call({}, '\0virtual:feature-metadata') as string;
      const importCount = (result.match(/import\(/g) || []).length;
      expect(importCount).toBe(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Duplicate feature ID "dupe"'),
      );
    });

    it('excludes enabled: false features from output', () => {
      const root = setupFixture('enabled', {
        'active.feature.js': featureSource(`id: "active", selectors: ["[data-a]"], priority: 1, onSetup() {}`),
        'inactive.feature.js': featureSource(`id: "inactive", selectors: ["[data-b]"], priority: 2, enabled: false, onSetup() {}`),
      });

      const plugin = featureMetadataPlugin();
      (plugin.configResolved as Function).call({}, { root });

      const result = (plugin.load as Function).call({}, '\0virtual:feature-metadata') as string;
      expect(result).toContain('"active"');
      expect(result).not.toContain('"inactive"');
    });

    it('generates correct virtual module with all fields', () => {
      const root = setupFixture('full', {
        'my.feature.js': featureSource(`
          id: "my-feature",
          selectors: ["[data-my]"],
          priority: 5,
          global: true,
          dependencies: ["dep-a"],
          timeout: 3000,
          onSetup() {}
        `),
      });

      const plugin = featureMetadataPlugin();
      (plugin.configResolved as Function).call({}, { root });

      const result = (plugin.load as Function).call({}, '\0virtual:feature-metadata') as string;

      expect(result).toContain('id: "my-feature"');
      expect(result).toContain('selectors: ["[data-my]"]');
      expect(result).toContain('priority: 5');
      expect(result).toContain('global: true');
      expect(result).toContain('dependencies: ["dep-a"]');
      expect(result).toContain('timeout: 3000');
      expect(result).toContain('import(');
      expect(result.startsWith('export default [')).toBe(true);
    });

    it('skips files with parse errors', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const root = setupFixture('parse-error', {
        'bad.feature.js': 'export default {{{',
        'good.feature.js': featureSource(`id: "good", selectors: ["[data-x]"], priority: 1, onSetup() {}`),
      });

      const plugin = featureMetadataPlugin();
      (plugin.configResolved as Function).call({}, { root });

      const result = (plugin.load as Function).call({}, '\0virtual:feature-metadata') as string;
      expect(result).toContain('"good"');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse'),
      );
    });

    it.skipIf(process.getuid?.() === 0)('warns and skips files that cannot be read', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const root = resolve(TMP_ROOT, 'read-fail');
      const featuresDir = resolve(root, 'src', 'features');
      mkdirSync(featuresDir, { recursive: true });
      writeFileSync(
        resolve(featuresDir, 'good.feature.js'),
        featureSource(`id: "good", selectors: ["[data-x]"], priority: 1, onSetup() {}`),
        'utf-8',
      );
      const unreadable = resolve(featuresDir, 'unreadable.feature.js');
      writeFileSync(
        unreadable,
        featureSource(`id: "bad", selectors: ["[data-y]"], priority: 2, onSetup() {}`),
        'utf-8',
      );
      chmodSync(unreadable, 0o000);

      try {
        const plugin = featureMetadataPlugin();
        (plugin.configResolved as Function).call({}, { root });
        const result = (plugin.load as Function).call({}, '\0virtual:feature-metadata') as string;

        expect(result).toContain('"good"');
        expect(result).not.toContain('"bad"');
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Could not read'),
        );
      } finally {
        chmodSync(unreadable, 0o644);
      }
    });

    it('serializes timeout:null and empty dependencies in virtual module', () => {
      const root = setupFixture('null-fields', {
        'minimal.feature.js': featureSource(`
          id: "minimal",
          selectors: ["[data-x]"],
          priority: 1,
          onSetup() {}
        `),
      });

      const plugin = featureMetadataPlugin();
      (plugin.configResolved as Function).call({}, { root });
      const result = (plugin.load as Function).call({}, '\0virtual:feature-metadata') as string;

      expect(result).toContain('timeout: null');
      expect(result).toContain('dependencies: []');
    });
  });
});
