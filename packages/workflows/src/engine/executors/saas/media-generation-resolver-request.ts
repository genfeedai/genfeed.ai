import type { ExecutableNode } from '../../types';

export interface MediaGenerationResolverRequest {
  model: string;
  params: Record<string, unknown>;
}

function request(
  config: Record<string, unknown>,
  params: Record<string, unknown>,
): MediaGenerationResolverRequest {
  if (config.model === undefined)
    throw new Error('Missing required config: model');
  return {
    model: config.model as string,
    params: Object.fromEntries(
      Object.entries(params).filter(([, value]) => value !== undefined),
    ),
  };
}

/** Pure input precedence shared by executor dispatch and financial preparation. */
export function buildImageGenerationResolverRequest(
  node: ExecutableNode,
  inputs: ReadonlyMap<string, unknown>,
): MediaGenerationResolverRequest {
  const config = node.config;
  const image = inputs.get('image') ?? config.image ?? undefined;
  return request(config, {
    brandId: config.brandId ?? undefined,
    cfg: config.cfg ?? undefined,
    faceImage: inputs.get('faceImage') ?? config.faceImage ?? undefined,
    height: config.height ?? 1024,
    negativePrompt: config.negativePrompt ?? undefined,
    prompt: inputs.get('prompt') ?? config.prompt ?? '',
    references: image ? [image] : undefined,
    seed: config.seed ?? undefined,
    steps: config.steps ?? undefined,
    strength: config.strength ?? undefined,
    style: config.style ?? undefined,
    width: config.width ?? 1024,
  });
}

/** Preserve the exact video resolver request, including its optional duration. */
export function buildVideoGenerationResolverRequest(
  node: ExecutableNode,
  inputs: ReadonlyMap<string, unknown>,
): MediaGenerationResolverRequest {
  const config = node.config;
  const image = inputs.get('image') ?? config.image ?? undefined;
  const videoReference =
    inputs.get('videoReference') ?? config.videoReference ?? undefined;
  return request(config, {
    actionVerb: config.actionVerb ?? undefined,
    brandId: config.brandId ?? undefined,
    duration: config.duration ?? undefined,
    height: config.height ?? 1080,
    identityReferences: config.identityReferences ?? undefined,
    lastFrame: inputs.get('lastFrame') ?? config.lastFrame ?? undefined,
    negativePrompt: config.negativePrompt ?? undefined,
    parentIngredientId: config.parentIngredientId ?? undefined,
    prompt: inputs.get('prompt') ?? config.prompt ?? '',
    references: image ? [image] : undefined,
    seed: config.seed ?? undefined,
    videoReferences: videoReference ? [videoReference] : undefined,
    width: config.width ?? 1920,
  });
}
