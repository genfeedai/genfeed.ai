/**
 * Complete environment configuration interface.
 * All properties are optional here - each service validates only what it needs.
 */
export interface IEnvConfig {
  // === Base ===
  NODE_ENV: 'development' | 'staging' | 'production' | 'test';
  PORT: number;
  TZ?: string;
  VERSION?: string;
  SERVICE_NAME?: string;
  API_METRICS_LOGGING?: 'true' | 'false';

  // === Genfeed Internal URLs ===
  GENFEEDAI_API_URL?: string;
  GENFEEDAI_CDN_URL?: string;
  GENFEEDAI_APP_URL?: string;
  GENFEEDAI_PUBLIC_URL?: string;
  GENFEEDAI_WEBHOOKS_URL?: string;

  // === Microservices ===
  GENFEEDAI_MICROSERVICES_FILES_URL?: string;
  GENFEEDAI_MICROSERVICES_MCP_URL?: string;
  GENFEEDAI_MICROSERVICES_NOTIFICATIONS_URL?: string;

  // === Internal Auth ===
  GENFEEDAI_API_KEY?: string;
  TOKEN_ENCRYPTION_KEY?: string;
  BULL_BOARD_AUTH_TOKEN?: string;

  // === PostgreSQL / Prisma ===
  DATABASE_URL?: string;

  // === Redis ===
  REDIS_URL?: string;
  REDIS_PASSWORD?: string;
  REDIS_TLS?: boolean;

  // === AWS / S3 ===
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  AWS_REGION?: string;
  AWS_S3_BUCKET?: string;
  AWS_IMAGE_COMPRESSION?: number;

  // === Clerk ===
  CLERK_PUBLISHABLE_KEY?: string;
  CLERK_SECRET_KEY?: string;
  CLERK_WEBHOOK_SIGNING_SECRET?: string;

  // === Sentry ===
  SENTRY_DSN?: string;
  SENTRY_ENVIRONMENT?: string;

  // === Stripe ===
  STRIPE_SECRET_KEY?: string;
  STRIPE_PUBLISHABLE_KEY?: string;
  STRIPE_WEBHOOK_SIGNING_SECRET?: string;
  STRIPE_API_VERSION?: string;
  STRIPE_PRICE_PAYG?: string;
  STRIPE_PRICE_SKILLS_PRO?: string;
  STRIPE_PAYG_CREDITS?: number;
  STRIPE_MONTHLY_CREDITS?: number;
  STRIPE_YEARLY_CREDITS?: number;
  STRIPE_COUPON_CREDITS_PACKS_V2_PRO?: string;
  STRIPE_COUPON_CREDITS_PACKS_V2_ENTERPRISE?: string;

  // === General AI ===
  AGENT_CONTEXT_COMPRESSION_ENABLED?: string;
  AGENT_CONTEXT_COMPRESSION_MODEL?: string;
  AGENT_CONTEXT_WINDOW_SIZE?: number;
  MAX_TOKENS?: number;

  // === fal.ai ===
  FAL_API_KEY?: string;

  // === HuggingFace ===
  HUGGINGFACE_API_KEY?: string;

  // === Replicate ===
  REPLICATE_KEY?: string;
  REPLICATE_WEBHOOK_SIGNING_SECRET?: string;
  REPLICATE_TARGET_FPS?: number;
  REPLICATE_TARGET_RESOLUTION?: string;
  REPLICATE_MODELS_TRAINER?: string;
  REPLICATE_OWNER?: string;
  REPLICATE_MODEL_VISIBILITY?: 'public' | 'private';
  REPLICATE_MODEL_HARDWARE?: string;

  // === KlingAI ===
  KLINGAI_KEY?: string;
  KLINGAI_SECRET?: string;
  KLINGAI_MODEL?: string;

  // === ElevenLabs ===
  ELEVENLABS_API_KEY?: string;
  ELEVENLABS_MODEL?: string;

  // === Leonardo ===
  LEONARDO_KEY?: string;

  // === HeyGen ===
  HEYGEN_KEY?: string;

  // === Hedra ===
  HEDRA_KEY?: string;
  HEDRA_URL?: string;

  // === Higgsfield ===
  HIGGSFIELD_API_KEY?: string;
  HIGGSFIELD_API_SECRET?: string;

  // === Darkroom (self-hosted GPU) ===
  DARKROOM_COMFYUI_URL?: string;
  DARKROOM_CLOUDFRONT_DISTRIBUTION_ID?: string;

  // === GPU Fleet (self-hosted instances) ===
  GPU_IMAGES_URL?: string;
  GPU_VOICES_URL?: string;
  GPU_VIDEOS_URL?: string;
  GPU_LLM_URL?: string;
  GPU_LLM_INSTANCE_ID?: string;

  // === Anthropic (Direct SDK) ===
  ANTHROPIC_API_KEY?: string;

  // === OpenAI (Direct SDK — for agent LLM, separate from assistants key) ===
  OPENAI_API_KEY?: string;
  OPENAI_CODEX_REDIRECT_URI?: string;

  // === OpenRouter ===
  OPENROUTER_API_KEY?: string;

  // === News API ===
  NEWS_API_KEY?: string;
  NEWS_API_URL?: string;

  // === Pricing ===
  TRAINING_TRAINING_CREDITS_COST?: number;
  TRAINING_CUSTOM_MODEL_CREDITS_COST?: number;

  // === Solana ===
  SOLANA_KEY?: string;
  SOLANA_URL?: string;

  // === YouTube ===
  YOUTUBE_CLIENT_ID?: string;
  YOUTUBE_CLIENT_SECRET?: string;
  YOUTUBE_REDIRECT_URI?: string;
  YOUTUBE_API_KEY?: string;

  // === TikTok ===
  TIKTOK_CLIENT_KEY?: string;
  TIKTOK_CLIENT_SECRET?: string;

  // === Instagram ===
  INSTAGRAM_GRAPH_URL?: string;
  INSTAGRAM_API_VERSION?: string;
  INSTAGRAM_APP_ID?: string;
  INSTAGRAM_APP_SECRET?: string;
  INSTAGRAM_REDIRECT_URI?: string;
  INSTAGRAM_CLIENT_ID?: string;
  INSTAGRAM_CLIENT_SECRET?: string;

  // === Facebook ===
  FACEBOOK_APP_ID?: string;
  FACEBOOK_APP_SECRET?: string;
  FACEBOOK_REDIRECT_URI?: string;
  FACEBOOK_GRAPH_URL?: string;
  FACEBOOK_API_VERSION?: string;

  // === Twitter ===
  TWITTER_BEARER_TOKEN?: string;
  TWITTER_CONSUMER_KEY?: string;
  TWITTER_CONSUMER_SECRET?: string;
  TWITTER_CLIENT_ID?: string;
  TWITTER_CLIENT_SECRET?: string;
  TWITTER_REDIRECT_URI?: string;

  // === Pinterest ===
  PINTEREST_CLIENT_ID?: string;
  PINTEREST_CLIENT_SECRET?: string;
  PINTEREST_REDIRECT_URI?: string;

  // === Reddit ===
  REDDIT_CLIENT_ID?: string;
  REDDIT_CLIENT_SECRET?: string;
  REDDIT_REDIRECT_URI?: string;
  REDDIT_USER_AGENT?: string;

  // === LinkedIn ===
  LINKEDIN_CLIENT_ID?: string;
  LINKEDIN_CLIENT_SECRET?: string;
  LINKEDIN_REDIRECT_URI?: string;

  // === Medium ===
  MEDIUM_CLIENT_ID?: string;
  MEDIUM_CLIENT_SECRET?: string;
  MEDIUM_REDIRECT_URI?: string;

  // === Fanvue ===
  FANVUE_CLIENT_ID?: string;
  FANVUE_CLIENT_SECRET?: string;
  FANVUE_REDIRECT_URI?: string;
  FANVUE_WEBHOOK_SECRET?: string;

  // === Slack ===
  SLACK_CLIENT_ID?: string;
  SLACK_CLIENT_SECRET?: string;
  SLACK_REDIRECT_URI?: string;
  SLACK_SIGNING_SECRET?: string;

  // === WordPress.com ===
  WORDPRESS_CLIENT_ID?: string;
  WORDPRESS_CLIENT_SECRET?: string;
  WORDPRESS_REDIRECT_URI?: string;

  // === Snapchat ===
  SNAPCHAT_CLIENT_ID?: string;
  SNAPCHAT_CLIENT_SECRET?: string;
  SNAPCHAT_REDIRECT_URI?: string;

  // === WhatsApp Business (Twilio) ===
  WHATSAPP_TWILIO_ACCOUNT_SID?: string;
  WHATSAPP_TWILIO_AUTH_TOKEN?: string;
  WHATSAPP_TWILIO_PHONE_NUMBER?: string;

  // === Mastodon ===
  MASTODON_DEFAULT_INSTANCE_URL?: string;

  // === Ghost ===
  GHOST_DEFAULT_API_URL?: string;

  // === Shopify ===
  SHOPIFY_CLIENT_ID?: string;
  SHOPIFY_CLIENT_SECRET?: string;
  SHOPIFY_REDIRECT_URI?: string;

  // === Google Ads ===
  GOOGLE_ADS_CLIENT_ID?: string;
  GOOGLE_ADS_CLIENT_SECRET?: string;
  GOOGLE_ADS_REDIRECT_URI?: string;
  GOOGLE_ADS_DEVELOPER_TOKEN?: string;

  // === Beehiiv ===
  BEEHIIV_API_URL?: string;

  // === Giphy ===
  GIPHY_API_KEY?: string;

  // === FFmpeg (Files service) ===
  FFMPEG_THREADS?: number;
  FFMPEG_PATH?: string;
  FFMPEG_VIDEO_CODEC?: string;
  FFMPEG_AUDIO_CODEC?: string;
  FFMPEG_CRF?: string;
  FFMPEG_PRESET?: string;
  FFMPEG_PIXEL_FORMAT?: string;
  FFMPEG_TIMEOUT?: string;
  FFMPEG_MAX_PROCESSES?: string;
  FFMPEG_TEMP_DIR?: string;
  TEMP_DIR?: string;
  WEBSOCKET_URL?: string;

  // === Webhooks ===
  VERCEL_WEBHOOK_SECRET?: string;
  CHROMATIC_WEBHOOK_SECRET?: string;

  // === Chrome Extension ===
  CHROME_EXTENSION_ID?: string;

  // === Opus Pro ===
  OPUS_PRO_KEY?: string;

  // === Misc ===
  APP_URL?: string;

  APIFY_API_TOKEN?: string;
  DISCORD_PUBLIC_KEY?: string;
  THREADS_REDIRECT_URI?: string;

  // === Discord / Notifications Service ===
  DISCORD_BOT_TOKEN?: string;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  DISCORD_REDIRECT_URI?: string;
  DISCORD_GUILD_ID?: string;
  DISCORD_CHANNEL_ID_POSTS?: string;
  DISCORD_CHANNEL_ID_STUDIO?: string;
  DISCORD_CHANNEL_ID_USERS?: string;
  DISCORD_BOT_AVATAR_URL?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_BOT_USERNAME?: string;
  TELEGRAM_ADMIN_IDS?: string;
  TELEGRAM_BOT_MODE?: string;
  TELEGRAM_ALLOWED_USER_IDS?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  RESEND_REPLY_TO_EMAIL?: string;
  TWITCH_CLIENT_ID?: string;
  API_BASE_URL?: string;
  API_SECRET_KEY?: string;

  // === Validation ===
  VALIDATION_MAX_FILE_SIZE?: string;
  VALIDATION_VIDEO_FORMATS?: string;
  VALIDATION_IMAGE_FORMATS?: string;
  VALIDATION_AUDIO_FORMATS?: string;

  // Stripe subscription plans
  STRIPE_PRICE_SUBSCRIPTION_CREATOR_MONTHLY?: string;
  STRIPE_PRICE_SUBSCRIPTION_PRO_MONTHLY?: string;
  STRIPE_PRICE_SUBSCRIPTION_SCALE_MONTHLY?: string;
  STRIPE_PRICE_SUBSCRIPTION_ENTERPRISE_MONTHLY?: string;
  STRIPE_BYOK_FEE_PERCENTAGE?: string;
  STRIPE_BYOK_FREE_THRESHOLD?: string;

  // Telegram
  TELEGRAM_BOT_DEFAULT_ORGANIZATION_ID?: string;
  TELEGRAM_BOT_DEFAULT_USER_ID?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;

  // Threads
  THREADS_API_VERSION?: string;
  THREADS_CLIENT_ID?: string;
  THREADS_CLIENT_SECRET?: string;
  THREADS_GRAPH_URL?: string;

  // AI
  XAI_MODEL?: string;

  // Allow additional env vars
  [key: string]: string | number | boolean | undefined;
}
