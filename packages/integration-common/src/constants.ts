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
  platform: 'telegram' | 'slack' | 'discord' | 'twitch';
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
