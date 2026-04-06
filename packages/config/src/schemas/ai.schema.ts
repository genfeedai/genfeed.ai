import Joi from 'joi';

/**
 * General AI config
 */
export const generalAiSchema = {
  MAX_TOKENS: Joi.number().default(4000),
};

/**
 * Replicate config
 */
export const replicateSchema = {
  REPLICATE_KEY: Joi.string().required(),
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
  REPLICATE_WEBHOOK_SIGNING_SECRET: Joi.string().required(),
};

/**
 * KlingAI video generation
 */
export const klingaiSchema = {
  KLINGAI_KEY: Joi.string().required(),
  KLINGAI_MODEL: Joi.string().default('kling-v2'),
  KLINGAI_SECRET: Joi.string().required(),
};

/**
 * ElevenLabs voice generation
 */
export const elevenlabsSchema = {
  ELEVENLABS_API_KEY: Joi.string().optional().allow(''),
  ELEVENLABS_MODEL: Joi.string().required(),
};

/**
 * Leonardo AI image generation
 */
export const leonardoSchema = {
  LEONARDO_KEY: Joi.string().required(),
};

/**
 * HeyGen avatar generation
 */
export const heygenSchema = {
  HEYGEN_KEY: Joi.string().required(),
};

/**
 * Hedra (optional)
 */
export const hedraSchema = {
  HEDRA_KEY: Joi.string().optional().allow(''),
};

/**
 * News API
 */
export const newsApiSchema = {
  NEWS_API_KEY: Joi.string().required(),
  NEWS_API_URL: Joi.string().uri().required(),
};

/**
 * Darkroom — self-hosted GPU instance (ComfyUI + darkroom-api)
 */
export const darkroomSchema = {
  DARKROOM_CLOUDFRONT_DISTRIBUTION_ID: Joi.string().optional().allow(''),
  DARKROOM_COMFYUI_URL: Joi.string()
    .uri()
    .optional()
    .default('http://100.106.229.81:8188'),
  DARKROOM_S3_BUCKET: Joi.string().optional().default('darkroom.genfeed.ai'),
};

/**
 * GPU Fleet — self-hosted GPU instances (images, voices, videos, llm)
 */
export const gpuFleetSchema = {
  GPU_IMAGES_URL: Joi.string().uri().optional().optional(),
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

export const trainingPricingSchema = {
  TRAINING_CUSTOM_MODEL_CREDITS_COST: Joi.number().default(5),
  TRAINING_TRAINING_CREDITS_COST: Joi.number().default(500),
};
