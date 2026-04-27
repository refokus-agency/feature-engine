import { parse } from 'acorn';
import type {
  ArrayExpression,
  CallExpression,
  ExportDefaultDeclaration,
  Expression,
  Identifier,
  Literal,
  ObjectExpression,
  Program,
  Property,
  SpreadElement,
  UnaryExpression,
} from 'acorn';

/** Static metadata extracted from a `.feature.js` file via AST analysis. */
export interface ParsedFeatureMeta {
  id: string;
  selectors: string[];
  priority: number;
  global: boolean;
  dependencies: string[];
  timeout: number | null;
  enabled: boolean;
}

const METADATA_KEYS = [
  'id',
  'selectors',
  'priority',
  'global',
  'dependencies',
  'enabled',
  'timeout',
] as const;

const REQUIRED_KEYS = ['id', 'selectors', 'priority'] as const;

function getPropName(prop: Property): string {
  if (prop.key.type === 'Identifier') return (prop.key as Identifier).name;
  return String((prop.key as Literal).value);
}

function extractLiteralValue(
  node: Expression | SpreadElement | null,
): string | number | boolean | (string | number | boolean)[] | undefined {
  if (!node) return undefined;

  if (node.type === 'Literal') {
    const val = (node as Literal).value;
    if (val === null) return undefined;
    return val as string | number | boolean;
  }

  if (node.type === 'ArrayExpression') {
    const arr = node as ArrayExpression;
    const values: (string | number | boolean)[] = [];
    for (const el of arr.elements) {
      if (!el || el.type !== 'Literal' || typeof (el as Literal).value !== 'string')
        return undefined;
      values.push((el as Literal).value as string);
    }
    return values;
  }

  if (node.type === 'UnaryExpression') {
    const unary = node as unknown as UnaryExpression;
    if (unary.operator === '-' && unary.argument.type === 'Literal') {
      const num = -(unary.argument as Literal).value! as number;
      if (!Number.isFinite(num)) return undefined;
      return num;
    }
  }

  return undefined;
}

function parseSource(source: string, filePath: string): Program | null {
  try {
    return parse(source, { ecmaVersion: 2022, sourceType: 'module' });
  } catch {
    console.warn(
      `[featureMetadataPlugin] Failed to parse ${filePath} — skipping`,
    );
    return null;
  }
}

function findDefineFeatureArg(ast: Program): ObjectExpression | null {
  for (const node of ast.body) {
    if (node.type === 'ExportDefaultDeclaration') {
      const decl = (node as ExportDefaultDeclaration).declaration;
      if (decl.type === 'CallExpression') {
        const call = decl as unknown as CallExpression;
        const callee = call.callee;
        if (
          callee.type === 'Identifier' &&
          (callee as Identifier).name === 'defineFeature' &&
          call.arguments.length === 1 &&
          call.arguments[0]!.type === 'ObjectExpression'
        ) {
          return call.arguments[0] as unknown as ObjectExpression;
        }
      }
    }
  }
  return null;
}

function extractMetadata(
  objectNode: ObjectExpression,
  filePath: string,
): ParsedFeatureMeta | null {
  const metadata: Record<string, unknown> = {};

  for (const prop of objectNode.properties) {
    if (prop.type !== 'Property' || (prop as Property).computed) continue;

    const key = getPropName(prop as Property);

    if ((METADATA_KEYS as readonly string[]).includes(key)) {
      const value = extractLiteralValue((prop as Property).value);
      if (value === undefined) {
        console.warn(
          `[featureMetadataPlugin] Non-literal value for "${key}" in ${filePath} — skipping file`,
        );
        return null;
      }
      if (key === 'id' && typeof value !== 'string') {
        console.warn(
          `[featureMetadataPlugin] "id" must be a string literal in ${filePath} — skipping file`,
        );
        return null;
      }
      if (key === 'priority' && typeof value !== 'number') {
        console.warn(
          `[featureMetadataPlugin] "priority" must be a numeric literal in ${filePath} — skipping file`,
        );
        return null;
      }
      if (key === 'global' && typeof value !== 'boolean') {
        console.warn(
          `[featureMetadataPlugin] "global" must be a boolean literal in ${filePath} — skipping file`,
        );
        return null;
      }
      if (key === 'timeout' && (typeof value !== 'number' || value <= 0)) {
        console.warn(
          `[featureMetadataPlugin] "timeout" must be a positive number in ${filePath} — skipping file`,
        );
        return null;
      }
      if (key === 'enabled' && typeof value !== 'boolean') {
        console.warn(
          `[featureMetadataPlugin] "enabled" must be a boolean literal in ${filePath} — skipping file`,
        );
        return null;
      }
      metadata[key] = value;
    }
  }

  for (const key of REQUIRED_KEYS) {
    if (metadata[key] == null) {
      console.warn(
        `[featureMetadataPlugin] Missing required field "${key}" in ${filePath} — skipping file`,
      );
      return null;
    }
  }

  const propKeys = objectNode.properties
    .filter(
      (p: Property | SpreadElement) =>
        p.type === 'Property' && !(p as Property).computed,
    )
    .map((p) => getPropName(p as Property));

  if (!propKeys.includes('onSetup') && !propKeys.includes('onEach')) {
    console.warn(
      `[featureMetadataPlugin] No onSetup or onEach found in ${filePath} — skipping`,
    );
    return null;
  }

  return {
    id: metadata.id as string,
    selectors: metadata.selectors as string[],
    priority: metadata.priority as number,
    global: (metadata.global as boolean) ?? false,
    dependencies: (metadata.dependencies as string[]) ?? [],
    timeout: (metadata.timeout as number) ?? null,
    enabled: (metadata.enabled as boolean) ?? true,
  };
}

export function parseFeatureFile(
  code: string,
  filePath: string,
): ParsedFeatureMeta | null {
  const ast = parseSource(code, filePath);
  if (!ast) return null;

  const objectNode = findDefineFeatureArg(ast);
  if (!objectNode) {
    console.warn(
      `[featureMetadataPlugin] No valid defineFeature() call found in ${filePath} — skipping`,
    );
    return null;
  }

  return extractMetadata(objectNode, filePath);
}
