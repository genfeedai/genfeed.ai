import type { LookupOptions, MultiPipelineStage } from './pipeline.types';

function includeFor(path: string, options?: LookupOptions): MultiPipelineStage {
  if (options?.preserveNull === false) {
    return [{ include: { [path]: true }, required: true }];
  }

  return [{ include: { [path]: true } }];
}

export function ingredientLookup(options?: LookupOptions): MultiPipelineStage {
  return includeFor(options?.as || 'ingredients', options);
}

export function credentialLookup(options?: LookupOptions): MultiPipelineStage {
  return includeFor(options?.as || 'credential', options);
}

export function childrenLookup(options?: LookupOptions): MultiPipelineStage {
  return includeFor(options?.as || 'children', options);
}

export function metadataLookup(options?: LookupOptions): MultiPipelineStage {
  return includeFor(options?.as || 'metadata', options);
}

export function userLookup(options?: LookupOptions): MultiPipelineStage {
  return includeFor(options?.as || 'user', options);
}

export function brandLookup(options?: LookupOptions): MultiPipelineStage {
  return includeFor(options?.as || 'brand', options);
}

export function organizationLookup(
  options?: LookupOptions,
): MultiPipelineStage {
  return includeFor(options?.as || 'organization', options);
}
