import { readFileSync, globSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { parseFeatureFile } from './parse-feature-file.ts';
import type { ParsedFeatureMeta } from './parse-feature-file.ts';

export type { ParsedFeatureMeta } from './parse-feature-file.ts';

/** Options for the `featureMetadataPlugin` Vite plugin. */
export interface FeatureMetadataPluginOptions {
  include?: string;
}

const VIRTUAL_MODULE_ID = 'virtual:feature-metadata';
const RESOLVED_VIRTUAL_ID = '\0' + VIRTUAL_MODULE_ID;

function findFeatureFiles(srcDir: string, include?: string): string[] {
  const pattern = include ?? 'features/**/*.feature.js';
  try {
    return globSync(resolve(srcDir, pattern));
  } catch (err) {
    console.warn(
      `[featureMetadataPlugin] glob failed for pattern "${pattern}" in "${srcDir}":`,
      err,
    );
    return [];
  }
}

function buildEntry(meta: ParsedFeatureMeta, filePath: string): string {
  return `  { id: ${JSON.stringify(meta.id)}, selectors: ${JSON.stringify(meta.selectors)}, priority: ${JSON.stringify(meta.priority)}, global: ${JSON.stringify(meta.global)}, dependencies: ${JSON.stringify(meta.dependencies)}, timeout: ${JSON.stringify(meta.timeout)}, load: () => import(${JSON.stringify(filePath)}) }`;
}

export function featureMetadataPlugin(
  options?: FeatureMetadataPluginOptions,
): Plugin {
  let srcDir: string | undefined;

  return {
    name: 'feature-metadata',

    configResolved(config) {
      srcDir = resolve(config.root, 'src');
    },

    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) {
        return RESOLVED_VIRTUAL_ID;
      }
    },

    load(id) {
      if (id !== RESOLVED_VIRTUAL_ID) return;
      if (!srcDir) {
        throw new Error(
          '[featureMetadataPlugin] configResolved has not been called yet',
        );
      }

      const featureFiles = findFeatureFiles(srcDir, options?.include);
      const entries: string[] = [];
      const seenIds = new Set<string>();

      for (const filePath of featureFiles) {
        let source: string;
        try {
          source = readFileSync(filePath, 'utf-8');
        } catch {
          console.warn(
            `[featureMetadataPlugin] Could not read ${filePath} — skipping`,
          );
          continue;
        }

        const metadata = parseFeatureFile(source, filePath);
        if (!metadata) continue;
        if (metadata.enabled === false) continue;

        if (seenIds.has(metadata.id)) {
          console.warn(
            `[featureMetadataPlugin] Duplicate feature ID "${metadata.id}" in ${filePath} — skipping`,
          );
          continue;
        }
        seenIds.add(metadata.id);

        entries.push(buildEntry(metadata, filePath));
      }

      return `export default [\n${entries.join(',\n')}\n];\n`;
    },

    handleHotUpdate({ file, server }) {
      if (file.endsWith('.feature.js')) {
        const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_ID);
        if (mod) {
          server.moduleGraph.invalidateModule(mod);
          return [mod];
        }
      }
    },
  };
}
