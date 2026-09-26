import Joi from 'joi';

import { conditionalRequired } from '../helpers';

/**
 * Model-discovery category decision (#4869, epic #4863).
 *
 * Its own fragment because the decision runs in `workers`, whose ConfigService
 * composes a much smaller schema than the API's. Both include this fragment so
 * the rollout mode and threshold carry the same defaults in either runtime.
 *
 * #4912 replaces this pair of env vars with a settings service; until then the
 * only reader is `resolveModelDiscoveryDecisionSettings`.
 */
export const modelDiscoveryDecisionSchema = {
  // `off` keeps the keyword table in control, `shadow` records the provider
  // answer next to it, `live` acts on it above MODEL_DISCOVERY_MIN_CONFIDENCE.
  MODEL_DISCOVERY_DECISION_MODE: Joi.string()
    .valid('off', 'shadow', 'live')
    .default('off'),
  MODEL_DISCOVERY_MIN_CONFIDENCE: Joi.number().min(0).max(1).default(0.85),
};

/**
 * Media validation (#4877). Perception (#4879) turns each completed image,
 * video or audio asset into persisted text artefacts off the publish path.
 */
export const mediaValidationSchema = {
  // Frames, OCR and transcript need no model; the scene description calls the
  // vision model below. `false` stops the workers sweep from enqueuing assets.
  MEDIA_PERCEPTION_ENABLED: Joi.string().valid('true', 'false').default('true'),
  // Evenly spaced stills sampled per video. Each costs one OCR pass and one
  // image in the vision prompt, so keep it small.
  MEDIA_PERCEPTION_FRAME_COUNT: Joi.number()
    .integer()
    .min(1)
    .max(24)
    .default(6),
  // How far back the sweep looks for completed assets without a record.
  // Older assets are not perceived; readers report them as pending.
  MEDIA_PERCEPTION_LOOKBACK_HOURS: Joi.number()
    .integer()
    .min(1)
    .max(720)
    .default(24),
  // Vision model for the scene description; empty uses LLM_DEFAULTS.fastText.
  MEDIA_PERCEPTION_VISION_MODEL: Joi.string().optional().allow(''),
  // Moderation classifier (#4880). `none` sends nothing off the host and
  // persists no verdict; `openai` uses omni-moderation (images and text).
  MODERATION_PROVIDER: Joi.string().valid('none', 'openai').default('none'),
  // `shadow` persists the result but never flags; `live` flags at threshold.
  // A live flip needs a benchmark run from the media-gate tooling (#4883).
  MODERATION_MODE: Joi.string().valid('off', 'shadow', 'live').default('shadow'),
  // Per-category overrides, `category=confidence` pairs, e.g.
  // `sexual=0.5,violence=0.7`. Unset categories keep the contract defaults
  // (DEFAULT_MODERATION_THRESHOLDS); lower is stricter.
  MODERATION_THRESHOLDS: Joi.string()
    .pattern(/^\s*[a-z_]+\s*=\s*(0(\.\d+)?|1(\.0+)?)\s*(,\s*[a-z_]+\s*=\s*(0(\.\d+)?|1(\.0+)?)\s*)*$/)
    .optional()
    .allow(''),
};

/**
 * General AI config
 */
export const generalAiSchema = {
  AGENT_CONTEXT_COMPRESSION_ENABLED: Joi.string()
    .valid('true', 'false')
    .default('true'),
  // Optional override. Unset falls back to LLM_DEFAULTS.volumeAgent in
  // ThreadContextCompressorService — do not copy a model id here.
  AGENT_CONTEXT_COMPRESSION_MODEL: Joi.string().optional().allow(''),
  AGENT_CONTEXT_WINDOW_SIZE: Joi.number().integer().min(1).default(5),
  // Coalescing window (#2517): live `agent:token` deltas are buffered per
  // run and flushed as one larger Redis publish either when this window
  // elapses or AGENT_STREAM_COALESCE_MAX_BYTES is hit, whichever is first.
  // Keeps perceived latency low (25-100ms) while collapsing what would
  // otherwise be one Redis publish + socket.io emit per LLM token into a
  // handful of publishes per response.
  AGENT_STREAM_COALESCE_MAX_BYTES: Joi.number().integer().min(1).default(2048),
  AGENT_STREAM_COALESCE_WINDOW_MS: Joi.number().integer().min(1).default(50),
  // Feature flag: real token-by-token LLM streaming for agent chat. When
  // 'false' (default) the orchestrator keeps the legacy simulated word-split
  // streaming. Toggle to 'true' to stream real provider deltas via agent:token.
  AGENT_TOKEN_STREAMING_ENABLED: Joi.string()
    .valid('true', 'false')
    .default('false'),
  MAX_TOKENS: Joi.number().default(4000),
  // Pattern analyzer typed decisions (#4868). Capped at shadow
  // (release-blocker follow-up, epic #4863): `off` keeps the rule-based
  // labels, `shadow` records provider/rule agreement, but a provider label is
  // never persisted — `live` is not a valid value here any more.
  PATTERN_ANALYZER_DECISION_MODE: Joi.string()
    .valid('off', 'shadow')
    .default('shadow'),
  PATTERN_ANALYZER_MIN_CONFIDENCE: Joi.number().min(0).max(1).default(0.85),
  // OpenRouter is the primary text-model gateway for agent chat. Must stay on
  // the validated schema so ConfigService.get('OPENROUTER_API_KEY') resolves
  // after Joi validation (unknown keys alone are not enough for typed access).
  OPENROUTER_API_KEY: Joi.string().optional().allow(''),
  // Agent auto-routing (#4865). No typed-decision provider is involved any
  // more (release-blocker follow-up, epic #4863): the candidate is a
  // deterministic read of the Admin-configured model registry. `off` keeps
  // the OpenRouter auto-router plugin exactly as it is today, `shadow` logs
  // the candidate it would dispatch, `live` dispatches it.
  AGENT_AUTO_ROUTING_DECISION_MODE: Joi.string()
    .valid('off', 'shadow', 'live')
    .default('off'),
  // Reply-bot intent (#4866). `off` keeps the regex classifier, `shadow` calls
  // the provider and records agreement while the regex still acts, `live` acts
  // on the decided intent above REPLY_BOT_INTENT_MIN_CONFIDENCE.
  REPLY_BOT_INTENT_DECISION_MODE: Joi.string()
    .valid('off', 'shadow', 'live')
    .default('off'),
  // Below this confidence the comment is neither auto-replied nor auto-skipped
  // — it is queued for a person. Conservative by default, per the epic.
  REPLY_BOT_INTENT_MIN_CONFIDENCE: Joi.number().min(0).max(1).default(0.85),
  // Typed decisions (#4864). Which provider is bound is an operator setting on
  // the platform-settings singleton (#4908), not an env var — the key here is
  // only the credential that makes a hosted provider available at all.
  // Task-routing output type (#4867). Capped at shadow (release-blocker
  // follow-up, epic #4863): `off` keeps the keyword table, `shadow` calls the
  // provider and records the disagreement, but the decided output type is
  // never acted on — `live` is not a valid value here any more.
  TASK_ROUTING_DECISION_MODE: Joi.string()
    .valid('off', 'shadow')
    .default('shadow'),
  TASK_ROUTING_MIN_CONFIDENCE: Joi.number().min(0).max(1).default(0.85),
  // Hard per-call budget. The agent turn path needs the 800ms default; async
  // paths pass their own budget through the call context instead.
  TYPED_DECISION_TIMEOUT_MS: Joi.number().integer().min(1).default(800),
  TYPESAFE_API_KEY: Joi.string().optional().allow(''),
  ...modelDiscoveryDecisionSchema,
  ...mediaValidationSchema,
  // Live activation is closed pending reviewed provider and real-traffic evidence (#4944).
  // Shadow records flags without withholding tool results.
  UNTRUSTED_CONTENT_DECISION_MODE: Joi.string()
    .valid('off', 'shadow')
    .default('off'),
  // Deliberately above the epic's 0.85 default: a false positive costs a user
  // their tool result, so the gate must be very sure before it withholds.
  UNTRUSTED_CONTENT_MIN_CONFIDENCE: Joi.number().min(0).max(1).default(0.95),
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
      'HeyGen-issued signing secret for the registered webhook endpoint, returned by POST/PATCH https://api.heygen.com/v3/webhooks/endpoints and used to verify the Heygen-Signature HMAC',
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
  MUREKA_MODEL: Joi.string().optional().default('mureka-9'),
};

export const trainingPricingSchema = {
  TRAINING_CUSTOM_MODEL_CREDITS_COST: Joi.number().default(5),
  TRAINING_TRAINING_CREDITS_COST: Joi.number().default(500),
};
