/**
 * Complete environment configuration interface.
 * All properties are optional here - each service validates only what it needs.
 */
export interface IEnvConfig {
  VISUAL_CODE_RENDERER_ENABLED?: 'true' | 'false';
  VISUAL_CODE_RENDERER_URL?: string;
  VISUAL_CODE_RENDERER_TOKEN?: string;
  VISUAL_CODE_RENDER_CREDITS_PER_SECOND?: number;

  NODE_ENV: 'development' | 'staging' | 'production' | 'test';
  PORT: number;
  TZ?: string;
  VERSION?: string;
  SERVICE_NAME?: string;
  API_METRICS_LOGGING?: 'true' | 'false';
  API_SENTRY_PERFORMANCE_METRICS?: 'true' | 'false';
  GENFEED_CLOUD?: string;
  TRUST_PROXY?: string;

  GENFEEDAI_API_PUBLIC_URL?: string;
  GENFEEDAI_API_URL?: string;
  GENFEEDAI_CDN_URL?: string;
  GENFEEDAI_MEDIA_ISSUER_ENABLED?: 'true' | 'false';
  GENFEEDAI_MEDIA_PREPARATION_ENABLED?: 'true' | 'false';
  GENFEEDAI_CDN_SIGNING_KEY_PAIR_ID?: string;
  GENFEEDAI_CDN_SIGNING_PRIVATE_KEY?: string;
  GENFEEDAI_CDN_SIGNED_URL_TTL_SECONDS?: string;
  GENFEEDAI_APP_URL?: string;
  GENFEEDAI_MCP_PUBLIC_URL?: string;
  GENFEEDAI_PUBLIC_URL?: string;
  GENFEEDAI_WEBHOOKS_URL?: string;

  GENFEEDAI_MICROSERVICES_FILES_URL?: string;
  GENFEEDAI_MICROSERVICES_MCP_URL?: string;
  GENFEEDAI_MICROSERVICES_NOTIFICATIONS_URL?: string;

  GENFEEDAI_API_KEY?: string;
  GENFEED_API_KEY?: string;
  GENFEED_MANAGED_INFERENCE_URL?: string;
  TOKEN_ENCRYPTION_KEY?: string;
  BULL_BOARD_AUTH_TOKEN?: string;

  // === PostgreSQL / Prisma ===
  DATABASE_URL?: string;

  // Which implementation backs the RedisService token (#2382). 'redis'
  // (default) connects to a real broker; 'in-process' serves pub/sub from
  // memory and is only valid for single-process deployments (desktop).
  REDIS_DRIVER?: string;
  REDIS_URL?: string;
  REDIS_PASSWORD?: string;
  REDIS_TLS?: boolean;
  // Per-workload isolation overrides (#1186) — each falls back to REDIS_URL / a
  // per-workload default logical DB when unset.
  REDIS_QUEUE_URL?: string;
  REDIS_QUEUE_DB?: number;
  REDIS_CACHE_URL?: string;
  REDIS_CACHE_DB?: number;
  REDIS_RATELIMIT_URL?: string;
  REDIS_RATELIMIT_DB?: number;
  REDIS_SOCKET_URL?: string;
  REDIS_SOCKET_DB?: number;

  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  AWS_REGION?: string;
  AWS_S3_BUCKET?: string;

  BETTER_AUTH_ENABLED?: 'true' | 'false';
  BETTER_AUTH_API_KEY?: string;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_TRUSTED_ORIGINS?: string;
  BETTER_AUTH_URL?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;

  GOOGLE_OAUTH_CLIENT_ID?: string;
  GOOGLE_OAUTH_CLIENT_SECRET?: string;

  SENTRY_DSN?: string;
  SENTRY_ENVIRONMENT?: string;

  NEXT_PUBLIC_POSTHOG_HOST?: string;
  NEXT_PUBLIC_POSTHOG_KEY?: string;
  POSTHOG_HOST?: string;
  POSTHOG_PROJECT_API_KEY?: string;

  STRIPE_SECRET_KEY?: string;
  STRIPE_PUBLISHABLE_KEY?: string;
  STRIPE_WEBHOOK_SIGNING_SECRET?: string;
  STRIPE_API_VERSION?: string;
  STRIPE_PRICE_PAYG?: string;
  STRIPE_PRICE_SKILLS_PRO?: string;

  AGENT_STREAM_COALESCE_MAX_BYTES?: number;
  AGENT_STREAM_COALESCE_WINDOW_MS?: number;

  FAL_API_KEY?: string;

  MUREKA_API_KEY?: string;
  MUREKA_API_BASE_URL?: string;

  REPLICATE_KEY?: string;
  REPLICATE_WEBHOOK_SIGNING_SECRET?: string;
  REPLICATE_OWNER?: string;

  KLINGAI_KEY?: string;
  KLINGAI_SECRET?: string;
  KLINGAI_WEBHOOK_SECRET?: string;

  ELEVENLABS_API_KEY?: string;

  LEONARDO_KEY?: string;
  LEONARDO_WEBHOOK_ALLOWED_IPS?: string;
  LEONARDO_WEBHOOK_SECRET?: string;

  HEYGEN_KEY?: string;
  HEYGEN_WEBHOOK_SECRET?: string;

  ARGIL_KEY?: string;
  ARGIL_WEBHOOK_SECRET?: string;

  OPUSPRO_WEBHOOK_SECRET?: string;

  HEDRA_KEY?: string;
  HEDRA_URL?: string;

  HIGGSFIELD_API_KEY?: string;
  HIGGSFIELD_API_SECRET?: string;
  /** Overrides the documented host `https://api.higgsfield.ai`. */
  HIGGSFIELD_API_BASE_URL?: string;

  FLEET_COMFYUI_URL?: string;
  FLEET_CLOUDFRONT_DISTRIBUTION_ID?: string;

  GPU_IMAGES_URL?: string;
  GPU_VOICES_URL?: string;
  GPU_VIDEOS_URL?: string;
  GPU_LLM_URL?: string;
  GPU_LLM_INSTANCE_ID?: string;

  ANTHROPIC_API_KEY?: string;

  OPENAI_API_KEY?: string;
  OPENAI_CODEX_REDIRECT_URI?: string;

  OPENROUTER_API_KEY?: string;

  // Rollout modes and thresholds are Admin platform settings (#5407).
  TYPESAFE_API_KEY?: string;
  // Eval-organization API key the content-eval media ladder (#4926) uses to
  // generate through the product API. Never a customer key.
  CONTENT_EVAL_GENFEED_API_KEY?: string;

  NEWS_API_KEY?: string;
  NEWS_API_URL?: string;

  SOLANA_KEY?: string;
  SOLANA_URL?: string;

  YOUTUBE_REDIRECT_URI?: string;
  YOUTUBE_API_KEY?: string;

  TIKTOK_CLIENT_KEY?: string;
  TIKTOK_CLIENT_SECRET?: string;

  INSTAGRAM_GRAPH_URL?: string;
  INSTAGRAM_API_VERSION?: string;
  INSTAGRAM_APP_ID?: string;
  INSTAGRAM_APP_SECRET?: string;
  INSTAGRAM_REDIRECT_URI?: string;
  INSTAGRAM_CLIENT_ID?: string;
  INSTAGRAM_CLIENT_SECRET?: string;

  FACEBOOK_APP_ID?: string;
  FACEBOOK_APP_SECRET?: string;
  FACEBOOK_REDIRECT_URI?: string;
  FACEBOOK_GRAPH_URL?: string;
  FACEBOOK_API_VERSION?: string;

  TWITTER_BEARER_TOKEN?: string;
  TWITTER_CONSUMER_KEY?: string;
  TWITTER_CONSUMER_SECRET?: string;
  TWITTER_CLIENT_ID?: string;
  TWITTER_CLIENT_SECRET?: string;
  TWITTER_REDIRECT_URI?: string;

  X_ADS_API_KEY?: string;
  X_ADS_API_SECRET?: string;
  X_ADS_REDIRECT_URI?: string;
  X_ADS_REPOSITORY_COMMERCIAL_USE_APPROVED?: 'true' | 'false';
  X_ADS_REPOSITORY_ENTITLEMENT_CONFIRMED?: 'true' | 'false';

  PINTEREST_CLIENT_ID?: string;
  PINTEREST_CLIENT_SECRET?: string;
  PINTEREST_REDIRECT_URI?: string;

  REDDIT_CLIENT_ID?: string;
  REDDIT_CLIENT_SECRET?: string;
  REDDIT_REDIRECT_URI?: string;
  REDDIT_USER_AGENT?: string;

  LINKEDIN_CLIENT_ID?: string;
  LINKEDIN_CLIENT_SECRET?: string;
  LINKEDIN_REDIRECT_URI?: string;

  MEDIUM_CLIENT_ID?: string;
  MEDIUM_CLIENT_SECRET?: string;
  MEDIUM_REDIRECT_URI?: string;

  FANVUE_CLIENT_ID?: string;
  FANVUE_CLIENT_SECRET?: string;
  FANVUE_REDIRECT_URI?: string;
  FANVUE_WEBHOOK_SECRET?: string;

  SLACK_CLIENT_ID?: string;
  SLACK_CLIENT_SECRET?: string;
  SLACK_REDIRECT_URI?: string;
  SLACK_SIGNING_SECRET?: string;

  WORDPRESS_CLIENT_ID?: string;
  WORDPRESS_CLIENT_SECRET?: string;
  WORDPRESS_REDIRECT_URI?: string;

  SNAPCHAT_CLIENT_ID?: string;
  SNAPCHAT_CLIENT_SECRET?: string;
  SNAPCHAT_REDIRECT_URI?: string;

  WHATSAPP_TWILIO_ACCOUNT_SID?: string;
  WHATSAPP_TWILIO_AUTH_TOKEN?: string;
  WHATSAPP_TWILIO_PHONE_NUMBER?: string;

  SHOPIFY_CLIENT_ID?: string;
  SHOPIFY_CLIENT_SECRET?: string;
  SHOPIFY_REDIRECT_URI?: string;

  GOOGLE_ADS_REDIRECT_URI?: string;
  GOOGLE_ADS_DEVELOPER_TOKEN?: string;
  GOOGLE_SEARCH_CONSOLE_REDIRECT_URI?: string;

  BEEHIIV_API_URL?: string;

  DEVTO_API_URL?: string;

  UNIPILE_API_BASE_URL?: string;
  UNIPILE_API_KEY?: string;
  UNIPILE_WEBHOOK_SECRET?: string;

  GIPHY_API_KEY?: string;

  FFMPEG_THREADS?: number;
  FFMPEG_VIDEO_CODEC?: string;
  FFMPEG_AUDIO_CODEC?: string;
  FFMPEG_CRF?: string;
  FFMPEG_PRESET?: string;
  FFMPEG_PIXEL_FORMAT?: string;
  FFMPEG_TIMEOUT?: string;
  FFMPEG_MAX_CONCURRENCY?: string;
  FFMPEG_TEMP_DIR?: string;
  TEMP_DIR?: string;
  WEBSOCKET_URL?: string;

  VERCEL_WEBHOOK_SECRET?: string;

  CHROME_EXTENSION_ID?: string;

  OPUS_PRO_KEY?: string;

  APP_URL?: string;

  APIFY_API_TOKEN?: string;
  DISCORD_PUBLIC_KEY?: string;
  THREADS_REDIRECT_URI?: string;

  DISCORD_BOT_TOKEN?: string;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  DISCORD_REDIRECT_URI?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_BOT_USERNAME?: string;
  TELEGRAM_BOT_MODE?: string;
  TELEGRAM_ALLOWED_USER_IDS?: string;
  RESEND_API_KEY?: string;
  /** Explicit dev opt-out: hosted-mode API may enforce email verification without a mailer. */
  ALLOW_EMAIL_VERIFICATION_WITHOUT_MAILER?: string;
  RESEND_WEBHOOK_SECRET?: string;
  TWITCH_CLIENT_ID?: string;
  API_BASE_URL?: string;
  API_SECRET_KEY?: string;
  GENFEED_LOCAL_TERMINAL?: 'true' | 'false';
  GENFEED_TERMINAL_CWD?: string;
  NEXT_PUBLIC_GENFEED_TERMINAL_CWD?: string;

  VALIDATION_MAX_FILE_SIZE?: string;
  VALIDATION_VIDEO_FORMATS?: string;
  VALIDATION_IMAGE_FORMATS?: string;
  VALIDATION_AUDIO_FORMATS?: string;

  // Stripe subscription plans
  STRIPE_PRICE_SUBSCRIPTION_SCALE_MONTHLY?: string;
  STRIPE_PRICE_SUBSCRIPTION_ENTERPRISE_MONTHLY?: string;

  // Telegram
  TELEGRAM_BOT_DEFAULT_ORGANIZATION_ID?: string;
  TELEGRAM_BOT_DEFAULT_USER_ID?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;

  // Threads
  THREADS_API_VERSION?: string;
  THREADS_CLIENT_ID?: string;
  THREADS_CLIENT_SECRET?: string;
  THREADS_GRAPH_URL?: string;

  XAI_MODEL?: string;

  // Allow additional env vars
  [key: string]: string | number | boolean | undefined;
}
