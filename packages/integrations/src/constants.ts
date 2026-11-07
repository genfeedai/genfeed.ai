import type { IntegrationPlatform } from '@genfeedai/contracts';

/**
 * Redis event constants for integration hot-reload
 */

export const REDIS_EVENTS = {
  DISCORD_SEND_TO_CHANNEL: 'discord:send-to-channel',
  INTEGRATION_CREATED: 'integration:created',
  INTEGRATION_DELETED: 'integration:deleted',
  INTEGRATION_UPDATED: 'integration:updated',
} as const;

export interface IntegrationEvent {
  orgId: string;
  platform: `${IntegrationPlatform}`;
  integrationId: string;
  data?: unknown;
}

export interface DiscordSendToChannelEvent {
  orgId: string;
  channelId: string;
  message: string;
}

export const IMAGE_MODELS = [
  'flux-dev',
  'flux-schnell',
  'flux-pro',
  'sdxl',
  'midjourney',
] as const;

export const VIDEO_MODELS = [
  'luma-dream-machine',
  'runway-gen3',
  'minimax-video',
  'kling-ai',
] as const;

export type ImageModel = (typeof IMAGE_MODELS)[number];
export type VideoModel = (typeof VIDEO_MODELS)[number];

/** Meta Graph and Marketing API share a version; Threads has its own release line. */
export const META_GRAPH_API_VERSION = 'v26.0';
export const META_GRAPH_URL = 'https://graph.facebook.com';
export const THREADS_API_VERSION = 'v1.0';
export const THREADS_GRAPH_URL = 'https://graph.threads.net';

export const FACEBOOK_OAUTH_SCOPES = [
  'ads_management',
  'ads_read',
  'public_profile',
  'email',
  'pages_show_list',
  'pages_manage_posts',
  'pages_read_engagement',
  'pages_manage_metadata',
  'pages_manage_engagement',
  'read_insights',
  'publish_video',
] as const;

/**
 * Instagram API with Unified Login: Meta renders the login dialog from a
 * configuration (`config_id`) created in the App Dashboard, so permissions are
 * not sent on the URL. These are the permissions that configuration must carry;
 * Instagram connect is not complete without them.
 *
 * @see https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/get-started
 */
export const INSTAGRAM_UNIFIED_LOGIN_PERMISSIONS = [
  'instagram_basic',
  'instagram_content_publish',
  'instagram_manage_comments',
  'instagram_manage_insights',
  'instagram_manage_messages',
] as const;

/** Unified Login dialog; unlike Facebook Login it is not versioned in the path. */
export const INSTAGRAM_UNIFIED_LOGIN_DIALOG_URL =
  'https://www.facebook.com/dialog/oauth';

/** Campaign creation uses ODAX objectives; historical read responses may contain older values. */
export const META_CAMPAIGN_OBJECTIVES = [
  'OUTCOME_APP_PROMOTION',
  'OUTCOME_AWARENESS',
  'OUTCOME_ENGAGEMENT',
  'OUTCOME_LEADS',
  'OUTCOME_SALES',
  'OUTCOME_TRAFFIC',
] as const;
