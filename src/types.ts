export interface FeatureDescriptor {
  id: string;
  selectors: readonly string[];
  priority: number;
  global: boolean;
  dependencies: readonly string[];
  enabled: boolean;
  timeout: number | null;
  onSetup:
    | ((selectors: string[]) => unknown | false | Promise<unknown | false>)
    | null;
  onEach:
    | ((ctx: {
        el: Element;
        index: number;
        elements: NodeListOf<Element>;
        ctx: unknown;
      }) => void | Promise<void>)
    | null;
  onReady: (() => void | Promise<void>) | null;
}

export interface FeatureDescriptorInput {
  id: string;
  selectors: string[];
  priority: number;
  global?: boolean;
  dependencies?: string[];
  enabled?: boolean;
  timeout?: number | null;
  onSetup?: FeatureDescriptor['onSetup'];
  onEach?: FeatureDescriptor['onEach'];
  onReady?: FeatureDescriptor['onReady'];
}

export interface FeatureMeta {
  id: string;
  selectors: string[];
  priority: number;
  global: boolean;
  dependencies: string[];
  timeout: number | null;
  load: () => Promise<{ default: FeatureDescriptor }>;
}

export interface LoaderOptions {
  timeout: number;
  logging: boolean;
}
