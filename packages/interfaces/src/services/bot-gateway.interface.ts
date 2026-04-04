import type {
  BotCommandType,
  BotInteractionType,
  BotResponseType,
  CredentialPlatform,
} from '@genfeedai/enums';

/**
 * Normalized message from any bot platform
 */
export interface IBotMessage {
  platform: CredentialPlatform;
  platformUserId: string;
  chatId: string;
  command: BotCommandType;
  prompt?: string;
  brandName?: string;
  interactionId?: string;
  interactionToken?: string;
  applicationId?: string;
  rawPayload?: unknown;
}

/**
 * Response to send back to the bot platform
 */
export interface IBotResponse {
  type: 'text' | 'media' | 'error' | 'deferred';
  message?: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
}

/**
 * Platform adapter interface - each platform implements this
 */
export interface IBotPlatformAdapter {
  platform: CredentialPlatform;

  /**
   * Validate the request signature/authenticity
   */
  validateSignature(
    body: Buffer | string,
    signature: string,
    timestamp?: string,
  ): boolean | Promise<boolean>;

  /**
   * Parse platform-specific request into normalized BotMessage
   * Returns null if not a command interaction
   */
  parseMessage(body: unknown): IBotMessage | null | Promise<IBotMessage | null>;

  /**
   * Get the interaction type for immediate response handling
   */
  getInteractionType(body: unknown): BotInteractionType | null;

  /**
   * Build immediate response payload (for Discord interaction ACK)
   */
  buildImmediateResponse(
    type: BotResponseType,
    message?: string,
  ): Record<string, unknown>;

  /**
   * Send a follow-up text message
   */
  sendFollowupMessage(
    applicationId: string,
    interactionToken: string,
    message: string,
  ): Promise<void>;

  /**
   * Send media (image/video) as a follow-up
   */
  sendFollowupMedia(
    applicationId: string,
    interactionToken: string,
    url: string,
    type: 'image' | 'video',
    caption?: string,
  ): Promise<void>;
}

/**
 * Resolved user from platform credentials
 */
export interface IBotResolvedUser {
  userId: string;
  organizationId: string;
  brandId: string;
  credentialId: string;
}

/**
 * Bot generation callback context stored for async completion
 */
export interface IBotCallbackContext {
  platform: CredentialPlatform;
  applicationId: string;
  interactionToken: string;
  chatId: string;
  ingredientId?: string;
}
