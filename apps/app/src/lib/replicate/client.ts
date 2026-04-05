import type { CostBreakdown, NodeCostEstimate } from '@genfeedai/types';
import Replicate from 'replicate';

export type { CostBreakdown, NodeCostEstimate } from '@genfeedai/types';

// Initialize Replicate client
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// Model identifiers
export const MODELS = {
  // Lip-sync models
  lipsync2: 'sync/lipsync-2',
  lipsync2Pro: 'sync/lipsync-2-pro',
  llama: 'meta/meta-llama-3.1-405b-instruct',
  nanoBanana: 'google/nano-banana',
  nanoBanana2: 'google/nano-banana-2',
  nanoBananaPro: 'google/nano-banana-pro',
  pixverseLipsync: 'pixverse/lipsync',
  veo: 'google/veo-3.1',
  veoFast: 'google/veo-3.1-fast',
} as const;

// Pricing per unit
export const PRICING = {
  llama: 0.0001, // per 1K tokens
  'nano-banana': 0.039, // per image
  'nano-banana-2': 0.039, // per image
  'nano-banana-pro': {
    '1K': 0.15,
    '2K': 0.2,
    '4K': 0.3,
  },
  'pixverse/lipsync': 0.04,
  // Lip-sync pricing (per second of output)
  'sync/lipsync-2': 0.05,
  'sync/lipsync-2-pro': 0.08325,
  'veo-3.1': {
    withAudio: 0.4,
    withoutAudio: 0.2,
  },
  'veo-3.1-fast': {
    withAudio: 0.15, // per second
    withoutAudio: 0.1,
  },
} as const;

// Type definitions
export interface ImageGenInput {
  prompt: string;
  image_input?: string[];
  aspect_ratio?: string;
  resolution?: string;
  output_format?: string;
  safety_filter_level?: string;
}

export interface VideoGenInput {
  prompt: string;
  image?: string;
  last_frame?: string;
  reference_images?: string[];
  duration?: number;
  aspect_ratio?: string;
  resolution?: string;
  generate_audio?: boolean;
  negative_prompt?: string;
  seed?: number;
}

export interface LLMInput {
  prompt: string;
  system_prompt?: string;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
}

export type LipSyncModel = 'sync/lipsync-2-pro' | 'sync/lipsync-2' | 'pixverse/lipsync';

export type LipSyncMode = 'loop' | 'bounce' | 'cut_off' | 'silence' | 'remap';

export interface LipSyncInput {
  video?: string;
  image?: string;
  audio: string;
  sync_mode?: LipSyncMode;
  temperature?: number;
  active_speaker?: boolean;
}

export interface PredictionResult {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output: unknown;
  error?: string;
  metrics?: {
    predict_time?: number;
  };
}

/**
 * Generate an image using nano-banana models
 */
export async function generateImage(
  model: 'nano-banana' | 'nano-banana-pro',
  input: ImageGenInput,
  webhookUrl?: string
): Promise<PredictionResult> {
  const modelId = model === 'nano-banana' ? MODELS.nanoBanana : MODELS.nanoBananaPro;

  const prediction = await replicate.predictions.create({
    input: {
      aspect_ratio: input.aspect_ratio ?? '1:1',
      image_input: input.image_input ?? [],
      output_format: input.output_format ?? 'jpg',
      prompt: input.prompt,
      ...(model === 'nano-banana-pro' && {
        resolution: input.resolution ?? '2K',
      }),
    },
    model: modelId,
    ...(webhookUrl && {
      webhook: webhookUrl,
      webhook_events_filter: ['completed'],
    }),
  });

  return prediction as PredictionResult;
}

/**
 * Generate a video using veo-3.1 models
 */
export async function generateVideo(
  model: 'veo-3.1-fast' | 'veo-3.1',
  input: VideoGenInput,
  webhookUrl?: string
): Promise<PredictionResult> {
  const modelId = model === 'veo-3.1-fast' ? MODELS.veoFast : MODELS.veo;

  const prediction = await replicate.predictions.create({
    input: {
      aspect_ratio: input.aspect_ratio ?? '16:9',
      duration: input.duration ?? 8,
      generate_audio: input.generate_audio ?? true,
      image: input.image,
      last_frame: input.last_frame,
      negative_prompt: input.negative_prompt,
      prompt: input.prompt,
      reference_images: input.reference_images,
      resolution: input.resolution ?? '1080p',
      seed: input.seed,
    },
    model: modelId,
    ...(webhookUrl && {
      webhook: webhookUrl,
      webhook_events_filter: ['completed'],
    }),
  });

  return prediction as PredictionResult;
}

/**
 * Generate text using meta-llama
 */
export async function generateText(input: LLMInput): Promise<string> {
  const output = await replicate.run(MODELS.llama, {
    input: {
      max_tokens: input.max_tokens ?? 1024,
      prompt: input.prompt,
      system_prompt: input.system_prompt ?? 'You are a helpful assistant.',
      temperature: input.temperature ?? 0.7,
      top_p: input.top_p ?? 0.9,
    },
  });

  // Output is typically an array of strings
  if (Array.isArray(output)) {
    return output.join('');
  }

  return String(output);
}

/**
 * Generate lip-synced video from image/video and audio
 */
export async function generateLipSync(
  model: LipSyncModel,
  input: LipSyncInput,
  webhookUrl?: string
): Promise<PredictionResult> {
  // Map model string to Replicate model identifier
  const modelMap: Record<LipSyncModel, string> = {
    'pixverse/lipsync': MODELS.pixverseLipsync,
    'sync/lipsync-2': MODELS.lipsync2,
    'sync/lipsync-2-pro': MODELS.lipsync2Pro,
  };

  const modelId = modelMap[model];

  // Build input based on model requirements
  // sync/lipsync models use video + audio
  // pixverse uses image + audio
  const modelInput: Record<string, unknown> = {
    audio: input.audio,
  };

  if (model.startsWith('sync/')) {
    // Sync Labs models expect video input
    modelInput.video = input.video || input.image;
    modelInput.sync_mode = input.sync_mode ?? 'loop';
    modelInput.temperature = input.temperature ?? 0.5;
    modelInput.active_speaker = input.active_speaker ?? false;
  } else {
    // Other models typically use image input
    modelInput.image = input.image || input.video;
  }

  const prediction = await replicate.predictions.create({
    input: modelInput,
    model: modelId,
    ...(webhookUrl && {
      webhook: webhookUrl,
      webhook_events_filter: ['completed'],
    }),
  });

  return prediction as PredictionResult;
}

/**
 * Get prediction status
 */
export async function getPredictionStatus(predictionId: string): Promise<PredictionResult> {
  const prediction = await replicate.predictions.get(predictionId);
  return prediction as PredictionResult;
}

/**
 * Cancel a prediction
 */
export async function cancelPrediction(predictionId: string): Promise<void> {
  await replicate.predictions.cancel(predictionId);
}

/**
 * Calculate cost estimate for a workflow
 */
export function calculateCost(
  imageCount: number,
  imageModel: 'nano-banana' | 'nano-banana-pro',
  imageResolution: string,
  videoSeconds: number,
  videoModel: 'veo-3.1-fast' | 'veo-3.1',
  withAudio: boolean
): number {
  let cost = 0;

  // Image cost
  if (imageModel === 'nano-banana') {
    cost += imageCount * PRICING['nano-banana'];
  } else {
    const res = imageResolution as keyof (typeof PRICING)['nano-banana-pro'];
    cost += imageCount * (PRICING['nano-banana-pro'][res] ?? 0.2);
  }

  // Video cost
  const videoKey = withAudio ? 'withAudio' : 'withoutAudio';
  cost += videoSeconds * PRICING[videoModel][videoKey];

  return cost;
}

/**
 * Calculate total estimated cost for a workflow based on its nodes
 */
export function calculateWorkflowCost(
  nodes: Array<{ type: string; data: Record<string, unknown> }>
): number {
  const { total } = calculateWorkflowCostWithBreakdown(nodes);
  return total;
}

/**
 * Calculate total estimated cost for a workflow with detailed breakdown per node
 */
export function calculateWorkflowCostWithBreakdown(
  nodes: Array<{ id?: string; type: string; data: Record<string, unknown> }>
): CostBreakdown {
  let total = 0;
  const items: NodeCostEstimate[] = [];

  for (const node of nodes) {
    const { id, type, data } = node;
    const nodeId = id ?? '';
    const nodeLabel = (data.label as string) ?? type;

    switch (type) {
      case 'imageGen': {
        const model = (data.model as 'nano-banana' | 'nano-banana-pro') ?? 'nano-banana';
        const resolution = (data.resolution as string) ?? '2K';
        let subtotal: number;

        if (model === 'nano-banana') {
          subtotal = PRICING['nano-banana'];
        } else {
          const res = resolution as keyof (typeof PRICING)['nano-banana-pro'];
          subtotal = PRICING['nano-banana-pro'][res] ?? 0.2;
        }

        total += subtotal;
        items.push({
          details: model === 'nano-banana' ? 'per image' : `${resolution} resolution`,
          model,
          nodeId,
          nodeLabel,
          nodeType: type,
          quantity: 1,
          subtotal,
          unitPrice: subtotal,
        });
        break;
      }

      case 'videoGen': {
        const model = (data.model as 'veo-3.1-fast' | 'veo-3.1') ?? 'veo-3.1-fast';
        const duration = (data.duration as number) ?? 4;
        const generateAudio = (data.generateAudio as boolean) ?? false;

        const videoKey = generateAudio ? 'withAudio' : 'withoutAudio';
        const perSecond = PRICING[model][videoKey];
        const subtotal = duration * perSecond;
        total += subtotal;

        items.push({
          details: `${duration}s ${generateAudio ? 'with' : 'without'} audio`,
          duration,
          model,
          nodeId,
          nodeLabel,
          nodeType: type,
          quantity: duration,
          subtotal,
          unitPrice: perSecond,
          withAudio: generateAudio,
        });
        break;
      }

      case 'lipSync': {
        const model = (data.model as LipSyncModel) ?? 'sync/lipsync-2';
        const pricing = PRICING[model];
        const estimatedDuration = 10;
        let subtotal = 0;

        if (typeof pricing === 'number') {
          subtotal = estimatedDuration * pricing;
          total += subtotal;
        }

        items.push({
          details: `~${estimatedDuration}s estimated`,
          duration: estimatedDuration,
          model,
          nodeId,
          nodeLabel,
          nodeType: type,
          quantity: estimatedDuration,
          subtotal,
          unitPrice: typeof pricing === 'number' ? pricing : 0,
        });
        break;
      }

      case 'llm': {
        const subtotal = 1000 * PRICING.llama;
        total += subtotal;

        items.push({
          details: '~1000 tokens estimated',
          model: 'llama-3.1-405b',
          nodeId,
          nodeLabel,
          nodeType: type,
          quantity: 1000,
          subtotal,
          unitPrice: PRICING.llama,
        });
        break;
      }

      // Other node types (input, output, processing) don't have direct API costs
      default:
        break;
    }
  }

  return { items, total };
}
