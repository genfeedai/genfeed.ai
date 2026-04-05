import type { ModelCapability, ModelUseCase, ProviderModel, ProviderType } from '@genfeedai/types';
// import falSchemas — fal schemas not yet migrated
import replicateSchemas from '@genfeedai/types/replicate/schemas.json';
import { type NextRequest, NextResponse } from 'next/server';

function getConfiguredProviders(headers: Headers): Set<ProviderType> {
  const configured = new Set<ProviderType>();

  if (process.env.REPLICATE_API_TOKEN || headers.get('x-replicate-key')) {
    configured.add('replicate');
  }
  if (process.env.FAL_API_KEY || headers.get('x-fal-key')) {
    configured.add('fal');
  }
  if (process.env.HF_API_TOKEN || headers.get('x-hf-key')) {
    configured.add('huggingface');
  }

  return configured;
}

const MODEL_METADATA: Record<
  string,
  {
    capabilities: ModelCapability[];
    pricing: string;
    displayName?: string;
    useCases?: ModelUseCase[];
  }
> = {
  'anthropic/claude-4.5-sonnet': {
    capabilities: ['text-generation'],
    displayName: 'Claude 4.5 Sonnet',
    pricing: '$0.003/$0.015 per 1K tokens',
  },
  'black-forest-labs/flux-1.1-pro': {
    capabilities: ['text-to-image'],
    displayName: 'FLUX 1.1 Pro',
    pricing: '$0.04/image',
    useCases: ['general'],
  },
  'black-forest-labs/flux-dev': {
    capabilities: ['text-to-image'],
    displayName: 'FLUX Dev',
    pricing: '$0.025/image',
    useCases: ['general'],
  },
  'black-forest-labs/flux-kontext-dev': {
    capabilities: ['text-to-image', 'image-to-image'],
    displayName: 'FLUX Kontext [dev]',
    pricing: '$0.025/image',
    useCases: ['style-transfer', 'character-consistent', 'image-variation'],
  },
  'black-forest-labs/flux-schnell': {
    capabilities: ['text-to-image'],
    displayName: 'FLUX Schnell',
    pricing: '$0.003/image',
    useCases: ['general'],
  },
  'google/nano-banana': {
    capabilities: ['text-to-image'],
    displayName: 'Nano Banana',
    pricing: '$0.039/image',
    useCases: ['general'],
  },
  'google/nano-banana-2': {
    capabilities: ['text-to-image', 'image-to-image'],
    displayName: 'Nano Banana 2',
    pricing: '$0.039/image',
    useCases: ['general', 'style-transfer', 'image-variation'],
  },
  'google/nano-banana-pro': {
    capabilities: ['text-to-image', 'image-to-image'],
    displayName: 'Nano Banana Pro',
    pricing: '$0.15-0.30/image',
    useCases: ['general', 'style-transfer', 'image-variation'],
  },
  'google/veo-3.1': {
    capabilities: ['text-to-video', 'image-to-video'],
    displayName: 'Veo 3.1',
    pricing: '$0.20-0.40/sec',
    useCases: ['general'],
  },
  'google/veo-3.1-fast': {
    capabilities: ['text-to-video', 'image-to-video'],
    displayName: 'Veo 3.1 Fast',
    pricing: '$0.10-0.15/sec',
    useCases: ['general'],
  },
  'kwaivgi/kling-v2.5-turbo-pro': {
    capabilities: ['text-to-video', 'image-to-video'],
    displayName: 'Kling v2.5 Turbo Pro',
    pricing: '$0.15/sec',
    useCases: ['general'],
  },
  'kwaivgi/kling-v2.6-motion-control': {
    capabilities: ['image-to-video'],
    displayName: 'Kling v2.6 Motion Control',
    pricing: '$0.20/sec',
    useCases: ['general'],
  },
  'luma/ray': {
    capabilities: ['text-to-video', 'image-to-video'],
    displayName: 'Luma Ray',
    pricing: '$0.15/sec',
    useCases: ['general'],
  },
  'meta/meta-llama-3.1-405b-instruct': {
    capabilities: ['text-generation'],
    displayName: 'Llama 3.1 405B Instruct',
    pricing: '$0.0032/1K tokens',
  },
  'minimax/video-01': {
    capabilities: ['text-to-video', 'image-to-video'],
    displayName: 'MiniMax Video-01',
    pricing: '$0.20/sec',
    useCases: ['general'],
  },
  'prunaai/z-image-turbo': {
    capabilities: ['text-to-image'],
    displayName: 'Z-Image Turbo',
    pricing: '$0.002/image',
    useCases: ['general'],
  },
  'sync/lipsync-2': {
    capabilities: ['image-to-video'],
    displayName: 'Lipsync 2',
    pricing: '$0.05/sec',
  },
  'sync/lipsync-2-pro': {
    capabilities: ['image-to-video'],
    displayName: 'Lipsync 2 Pro',
    pricing: '$0.10/sec',
  },
};

function detectUseCases(schema: Record<string, unknown> | undefined): ModelUseCase[] {
  if (!schema) return [];

  const detected: ModelUseCase[] = [];
  const schemaStr = JSON.stringify(schema).toLowerCase();

  if (schemaStr.includes('ip_adapter') || schemaStr.includes('style_image')) {
    detected.push('style-transfer');
  }
  if (schemaStr.includes('reference_image') || schemaStr.includes('subject_image')) {
    detected.push('character-consistent');
  }
  if (schemaStr.includes('mask') || schemaStr.includes('inpaint')) {
    detected.push('inpainting');
  }
  if (schemaStr.includes('upscale') || schemaStr.includes('scale_factor')) {
    detected.push('upscale');
  }

  return detected;
}

const REPLICATE_MODELS: ProviderModel[] = replicateSchemas
  .filter((schema) => MODEL_METADATA[schema.modelId])
  .map((schema) => {
    const meta = MODEL_METADATA[schema.modelId];
    const componentSchemas = (schema as { componentSchemas?: Record<string, unknown> })
      .componentSchemas;
    const explicitUseCases = meta.useCases || [];
    const schemaUseCases = detectUseCases(
      schema.inputSchema as Record<string, unknown> | undefined
    );
    const allUseCases = [...new Set([...explicitUseCases, ...schemaUseCases])];

    return {
      capabilities: meta.capabilities,
      componentSchemas: componentSchemas as Record<string, unknown> | undefined,
      description: schema.description?.slice(0, 100) || '',
      displayName: meta.displayName || schema.name,
      id: schema.modelId,
      inputSchema: schema.inputSchema as Record<string, unknown> | undefined,
      pricing: meta.pricing,
      provider: 'replicate' as ProviderType,
      thumbnail: (schema as { coverImageUrl?: string }).coverImageUrl || undefined,
      useCases: allUseCases.length > 0 ? allUseCases : undefined,
    };
  });

const FAL_MODEL_METADATA: Record<
  string,
  {
    capabilities: ModelCapability[];
    pricing: string;
    displayName?: string;
    useCases?: ModelUseCase[];
  }
> = {
  'fal-ai/flux-pro': {
    capabilities: ['text-to-image'],
    displayName: 'FLUX Pro',
    pricing: '$0.05/image',
    useCases: ['general'],
  },
  'fal-ai/flux/schnell': {
    capabilities: ['text-to-image'],
    displayName: 'FLUX Schnell',
    pricing: '$0.003/image',
    useCases: ['general'],
  },
  'fal-ai/kling-video': {
    capabilities: ['text-to-video', 'image-to-video'],
    displayName: 'Kling Video',
    pricing: '$0.10/sec',
    useCases: ['general'],
  },
  'fal-ai/nano-banana-2/edit': {
    capabilities: ['text-to-image', 'image-to-image'],
    displayName: 'Nano Banana 2 Edit',
    pricing: '$0.039/image',
    useCases: ['general', 'style-transfer', 'image-variation'],
  },
};

const falSchemas: { modelId: string; description?: string; name: string; componentSchemas?: Record<string, unknown>; inputSchema?: Record<string, unknown> }[] = [];
const FAL_MODELS: ProviderModel[] = falSchemas
  .filter((schema) => FAL_MODEL_METADATA[schema.modelId])
  .map((schema) => {
    const meta = FAL_MODEL_METADATA[schema.modelId];
    const componentSchemas = (schema as { componentSchemas?: Record<string, unknown> })
      .componentSchemas;

    return {
      capabilities: meta.capabilities,
      componentSchemas: componentSchemas as Record<string, unknown> | undefined,
      description: schema.description?.slice(0, 100) || '',
      displayName: meta.displayName || schema.name,
      id: schema.modelId,
      inputSchema: schema.inputSchema as Record<string, unknown> | undefined,
      pricing: meta.pricing,
      provider: 'fal' as ProviderType,
      useCases: meta.useCases,
    };
  });

const REPLICATE_LLM_MODELS: ProviderModel[] = [
  {
    capabilities: ['text-generation'],
    description: 'Anthropic Claude 4.5 Sonnet — fast, intelligent text generation',
    displayName: 'Claude 4.5 Sonnet',
    id: 'anthropic/claude-4.5-sonnet',
    pricing: '$0.003/$0.015 per 1K tokens',
    provider: 'replicate',
    useCases: ['general'],
  },
];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const provider = searchParams.get('provider') as ProviderType | null;
  const capabilitiesParam = searchParams.get('capabilities');
  const useCaseParam = searchParams.get('useCase') as ModelUseCase | null;
  const query = searchParams.get('query')?.toLowerCase();

  const capabilities = capabilitiesParam
    ? (capabilitiesParam.split(',') as ModelCapability[])
    : null;

  const configuredProviders = getConfiguredProviders(request.headers);

  const allModels: ProviderModel[] = [];

  if (configuredProviders.has('replicate')) {
    allModels.push(...REPLICATE_MODELS);
    const existingIds = new Set(allModels.map((m) => m.id));
    for (const model of REPLICATE_LLM_MODELS) {
      if (!existingIds.has(model.id)) {
        allModels.push(model);
      }
    }
  }

  if (configuredProviders.has('fal')) {
    allModels.push(...FAL_MODELS);
  }

  let filteredModels = allModels.filter((m) => configuredProviders.has(m.provider));

  if (provider && configuredProviders.has(provider)) {
    filteredModels = filteredModels.filter((m) => m.provider === provider);
  }

  if (capabilities?.length) {
    filteredModels = filteredModels.filter((m) =>
      m.capabilities.some((c) => capabilities.includes(c))
    );
  }

  if (useCaseParam) {
    filteredModels = filteredModels.filter((m) => m.useCases?.includes(useCaseParam));
  }

  if (query) {
    filteredModels = filteredModels.filter(
      (m) =>
        m.displayName.toLowerCase().includes(query) ||
        m.id.toLowerCase().includes(query) ||
        m.description?.toLowerCase().includes(query)
    );
  }

  return NextResponse.json({
    configuredProviders: Array.from(configuredProviders),
    models: filteredModels,
  });
}
