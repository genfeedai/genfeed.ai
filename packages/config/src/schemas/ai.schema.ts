import Joi from 'joi';

import { conditionalRequired } from '../helpers';

/**
 * General AI config
 */
export const generalAiSchema = {
  AGENT_CONTEXT_COMPRESSION_ENABLED: Joi.string()
    .valid('true', 'false')
    .default('true'),
  AGENT_CONTEXT_COMPRESSION_MODEL: Joi.string().default(
    'deepseek/deepseek-chat',
  ),
  AGENT_CONTEXT_WINDOW_SIZE: Joi.number().integer().min(1).default(5),
  // Feature flag: real token-by-token LLM streaming for agent chat. When
  // 'false' (default) the orchestrator keeps the legacy simulated word-split
  // streaming. Toggle to 'true' to stream real provider deltas via agent:token.
  AGENT_TOKEN_STREAMING_ENABLED: Joi.string()
    .valid('true', 'false')
    .default('false'),
  MAX_TOKENS: Joi.number().default(4000),
};

/**
 * Replicate config
 */
export const replicateSchema = {
  REPLICATE_KEY: conditionalRequired(),
  REPLICATE_MODEL_HARDWARE: Joi.string().default('gpu-t4'),
  REPLICATE_MODEL_VISIBILITY: Joi.string()
    .valid('public', 'private')
    .default('private'),
  REPLICATE_MODELS_TRAINER: Joi.string().default(
    'replicate/fast-flux-trainer:f463fbfc97389e10a2f443a8a84b6953b1058eafbf0c9af4d84457ff07cb04db',
  ),
  REPLICATE_OWNER: Joi.string().default('genfeedai'),
  REPLICATE_TARGET_FPS: Joi.number().default(30),
  REPLICATE_TARGET_RESOLUTION: Joi.string().default('1080p'),
  REPLICATE_WEBHOOK_SIGNING_SECRET: conditionalRequired(),
};

/**
 * KlingAI video generation
 */
export const klingaiSchema = {
  KLINGAI_KEY: conditionalRequired(),
  KLINGAI_MODEL: Joi.string().default('kling-v2'),
  KLINGAI_SECRET: conditionalRequired(),
  KLINGAI_WEBHOOK_SECRET: Joi.string()
    .optional()
    .allow('')
    .description(
      'Shared secret appended to the KlingAI callback URL and verified on inbound webhooks',
    ),
};

/**
 * ElevenLabs voice generation
 */
export const elevenlabsSchema = {
  ELEVENLABS_API_KEY: Joi.string().optional().allow(''),
  ELEVENLABS_MODEL: conditionalRequired(),
};

/**
 * Leonardo AI image generation
 */
export const leonardoSchema = {
  LEONARDO_KEY: conditionalRequired(),
};

/**
 * HeyGen avatar generation
 */
export const heygenSchema = {
  HEYGEN_KEY: conditionalRequired(),
  HEYGEN_WEBHOOK_SECRET: Joi.string()
    .optional()
    .allow('')
    .description(
      'Shared secret appended to the HeyGen callback URL and verified on inbound webhooks',
    ),
};

/**
 * OpusPro clip generation (API key lives in the api-keys collection;
 * only the webhook shared secret is environment config)
 */
export const opusProSchema = {
  OPUSPRO_WEBHOOK_SECRET: Joi.string()
    .optional()
    .allow('')
    .description(
      'Shared secret appended to the OpusPro callback URL and verified on inbound webhooks',
    ),
};

/**
 * Hedra (optional)
 */
export const hedraSchema = {
  HEDRA_KEY: Joi.string().optional().allow(''),
  HEDRA_URL: Joi.string().uri().optional().allow(''),
};

/**
 * News API
 */
export const newsApiSchema = {
  NEWS_API_KEY: conditionalRequired(),
  NEWS_API_URL: conditionalRequired(Joi.string().uri()),
};

/**
 * Darkroom — self-hosted GPU instance (ComfyUI + darkroom-api)
 */
export const darkroomSchema = {
  DARKROOM_CLOUDFRONT_DISTRIBUTION_ID: Joi.string().optional().allow(''),
  DARKROOM_COMFYUI_URL: Joi.string().uri().optional(),
  DARKROOM_S3_BUCKET: Joi.string().optional().default('darkroom.genfeed.ai'),
};

/**
 * GPU Fleet — self-hosted GPU instances (images, voices, videos, llm)
 */
export const gpuFleetSchema = {
  GPU_IMAGES_URL: Joi.string().uri().optional(),
  GPU_LLM_INSTANCE_ID: Joi.string().optional(),
  GPU_LLM_URL: Joi.string().uri().optional(),
  GPU_VIDEOS_URL: Joi.string().uri().optional(),
  GPU_VOICES_URL: Joi.string().uri().optional(),
};

/**
 * Training credits pricing
 */
/**
 * fal.ai image/video generation
 */
export const falSchema = {
  FAL_API_KEY: Joi.string().optional().allow(''),
};

/**
 * HuggingFace Inference API
 */
export const huggingFaceSchema = {
  HUGGINGFACE_API_KEY: Joi.string().optional().allow(''),
};

export const trainingPricingSchema = {
  TRAINING_CUSTOM_MODEL_CREDITS_COST: Joi.number().default(5),
  TRAINING_TRAINING_CREDITS_COST: Joi.number().default(500),
};
