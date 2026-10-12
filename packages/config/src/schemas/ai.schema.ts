import Joi from 'joi';

import { conditionalRequired } from '../helpers';

/**
 * General AI config.
 *
 * Product behaviour (rollout modes, confidence thresholds, feature switches)
 * is not env: it lives on the Admin platform-settings singleton (#5407), and
 * `bun run check:env-product-flags` fails CI if a new one appears here.
 */
export const generalAiSchema = {
  // Deployment transport admission only; reviewed registry rows govern product availability.
  CRUN_ENABLED: Joi.string().valid('true', 'false').default('false'),
  CRUN_API_KEY: Joi.string().optional().allow(''),
  CRUN_CREDITS_PER_USD: Joi.string()
    .pattern(/^(?:0*[1-9]\d*(?:\.\d+)?|0*\.\d*[1-9]\d*)$/)
    .optional(),
  CRUN_RATE_VERSION: Joi.string().trim().min(1).optional(),
  VISUAL_CODE_RENDERER_ENABLED: Joi.string()
    .valid('true', 'false')
    .default('false'),
  VISUAL_CODE_RENDERER_URL: Joi.string()
    .uri()
    .when('VISUAL_CODE_RENDERER_ENABLED', {
      is: 'true',
      // biome-ignore lint/suspicious/noThenProperty: Joi conditional schema key.
      then: Joi.required(),
      otherwise: Joi.optional().allow(''),
    }),
  VISUAL_CODE_RENDERER_TOKEN: Joi.string()
    .min(32)
    .when('VISUAL_CODE_RENDERER_ENABLED', {
      is: 'true',
      // biome-ignore lint/suspicious/noThenProperty: Joi conditional schema key.
      then: Joi.required(),
      otherwise: Joi.optional().allow(''),
    }),
  VISUAL_CODE_RENDER_CREDITS_PER_SECOND: Joi.number()
    .min(0)
    .when('VISUAL_CODE_RENDERER_ENABLED', {
      is: 'true',
      // biome-ignore lint/suspicious/noThenProperty: Joi conditional schema key.
      then: Joi.required(),
      otherwise: Joi.optional(),
    }),

  // Redis token streaming transport buffer; product defaults live in admin.
  AGENT_STREAM_COALESCE_MAX_BYTES: Joi.number().integer().min(1).default(2048),
  AGENT_STREAM_COALESCE_WINDOW_MS: Joi.number().integer().min(1).default(50),
  OPENROUTER_API_KEY: Joi.string().optional().allow(''),
  // Typed decisions (#4864). Which provider is bound, and every decision
  // point's mode and threshold, are Admin platform settings (#4908, #5407) —
  // the key here is only the credential that makes a hosted provider available.
  TYPESAFE_API_KEY: Joi.string().optional().allow(''),
  CONTENT_EVAL_GENFEED_API_KEY: Joi.string().optional().allow(''),
};

/**
 * Replicate config
 */
export const replicateSchema = {
  REPLICATE_KEY: conditionalRequired(),
  REPLICATE_OWNER: Joi.string().default('genfeedai'),
  REPLICATE_WEBHOOK_SIGNING_SECRET: conditionalRequired(),
};

/**
 * KlingAI video generation
 */
export const klingaiSchema = {
  KLINGAI_KEY: conditionalRequired(),
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
};

/**
 * Leonardo AI image generation
 */
export const leonardoSchema = {
  LEONARDO_KEY: conditionalRequired(),
  LEONARDO_WEBHOOK_ALLOWED_IPS: Joi.string()
    .optional()
    .allow('')
    .description(
      'Comma-separated egress IPs allowed to call the Leonardo callback. Overrides the shipped vendor list so rotations do not need a deploy',
    ),
  LEONARDO_WEBHOOK_SECRET: Joi.string()
    .optional()
    .allow('')
    .description(
      'Webhook callback API key registered with Leonardo.Ai, presented as an Authorization: Bearer header and verified on inbound webhooks',
    ),
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
      'HeyGen-issued signing secret for the registered webhook endpoint, returned by POST/PATCH https://api.heygen.com/v3/webhooks/endpoints and used to verify the signature HMAC',
    ),
};

/**
 * Argil avatar video generation
 */
export const argilSchema = {
  ARGIL_KEY: Joi.string().optional().allow(''),
  ARGIL_WEBHOOK_SECRET: conditionalRequired().description(
    'Private secret used to derive per-video HMAC tokens for Argil callback URLs',
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
 * Fleet — self-hosted GPU instance (ComfyUI + fleet-api)
 */
export const fleetSchema = {
  FLEET_CLOUDFRONT_DISTRIBUTION_ID: Joi.string().optional().allow(''),
  FLEET_COMFYUI_URL: Joi.string().uri().optional().allow(''),
  FLEET_S3_BUCKET: Joi.string().optional().default('fleet.genfeed.ai'),
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
 * Mureka V9 (`mureka-9`) — direct API integration (not fal/Replicate). Optional: the
 * catalog row seeds inactive until an operator configures and activates it.
 */
export const murekaSchema = {
  MUREKA_API_BASE_URL: Joi.string()
    .uri()
    .optional()
    .default('https://api.mureka.ai'),
  MUREKA_API_KEY: Joi.string().optional().allow(''),
};
