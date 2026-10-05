import type { ModelPricingRateChange } from '../billing/model-pricing.interface';

/**
 * Channel message payloads the notifications service renders. Messages are
 * recorded in the durable outbox by the activity recording API (#5197) and
 * handed to the notifications service by the delivery worker.
 */

export type INotificationPayloadTypes =
  | ITelegramMessagePayload
  | IEmailPayload
  | IDiscordCardPayload
  | IArticleNotificationPayload
  | IVercelNotificationPayload
  | IUserCreatedPayload
  | IIngredientNotificationPayload
  | IModelDiscoveryNotificationPayload
  | IModelPriceChangePayload
  | IModelPricingUnavailablePayload
  | IReviewGatePendingEmailPayload
  | ILowCreditsAlertPayload
  | IRevenueNotificationPayload;

/** Channels a rendered message is delivered on through the outbox (#5197). */
export const CHANNEL_MESSAGE_TYPES = [
  'discord',
  'email',
  'slack',
  'telegram',
] as const;
export type ChannelMessageType = (typeof CHANNEL_MESSAGE_TYPES)[number];

/** A rendered channel message: the notifications service's render vocabulary. */
export interface IChannelMessage {
  type: ChannelMessageType;
  action: string;
  payload: INotificationPayloadTypes;
}

/** Internal request from the delivery worker to the notifications service. */
export interface IChannelDeliveryRequest {
  idempotencyKey: string;
  /** Email address, chat or channel id; null for the operator's channel. */
  destination: string | null;
  message: IChannelMessage;
}

/**
 * `delivered` once the provider accepted the message; `skipped` when the
 * channel is not configured on this deployment (for example no operator
 * Discord). Provider failures are HTTP errors with `{ message, retryable }`.
 */
export type IChannelDeliveryResponse =
  | { status: 'delivered'; messageId: string }
  | { status: 'skipped'; reason: string };

export interface ITelegramMessagePayload {
  chatId: string;
  message: string;
  options?: ITelegramMessageOptions;
}

export interface ITelegramMessageOptions {
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  disable_web_page_preview?: boolean;
  disable_notification?: boolean;
  reply_to_message_id?: number;
}

export interface IEmailPayload {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export interface IEmailDeliveryRequest extends IEmailPayload {
  idempotencyKey?: string;
  replyTo?: string;
  text?: string;
}

export interface IEmailDeliveryResponse {
  emailId: string;
}

/**
 * Whether the notifications service has an email provider (`RESEND_API_KEY`).
 * Only that service holds the key, so the API asks rather than reading env.
 */
export interface IEmailDeliveryStatusResponse {
  isConfigured: boolean;
}

export interface IEmailDeliveryErrorResponse {
  message: string;
  retryable: boolean;
}

export interface IReviewGatePendingEmailPayload {
  to: string;
  workflowId: string;
  workflowLabel: string;
  executionId: string;
  nodeId: string;
  reviewUrl?: string;
  captionPreview?: string;
  organizationId?: string;
  userId?: string;
}

export interface IDiscordCardPayload {
  card: IDiscordEmbed;
}

export interface IDiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  fields?: IDiscordEmbedField[];
  thumbnail?: { url: string };
  image?: { url: string };
  footer?: { text: string; icon_url?: string };
  timestamp?: string;
}

export interface IDiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface IArticleNotificationPayload {
  label: string;
  slug: string;
  summary?: string;
  category?: string;
  publicUrl?: string;
}

export interface IVercelNotificationPayload {
  embed: IDiscordEmbed;
}

export interface IUserCreatedPayload {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  isInvited?: boolean;
}

export interface IIngredientNotificationPayload {
  category: string;
  cdnUrl: string;
  ingredient: IIngredientNotificationData;
}

export interface IIngredientNotificationData {
  id: string;
  brand?: { label?: string };
  label?: string;
  metadata?: {
    duration?: number;
    externalProvider?: string;
    height?: number;
    model?: string;
    width?: number;
  };
  prompt?: { original?: string };
  type?: string;
  status?: string;
  thumbnailUrl?: string;
  [key: string]: unknown;
}

export interface IModelDiscoveryNotificationPayload {
  modelKey: string;
  category: string;
  estimatedCost: number;
  providerCostUsd: number;
  provider: string;
  qualityTier?: string;
  speedTier?: string;
}

/** A provider changed its price; the approved rate keeps charging until approval. */
export interface IModelPriceChangePayload {
  modelKey: string;
  provider: string;
  changes: ModelPricingRateChange[];
  sourceUrl: string | null;
}

/** An active model became unpriceable, or its price refresh failed. */
export interface IModelPricingUnavailablePayload {
  modelKey: string;
  provider: string;
  reason: string;
}

export interface ILowCreditsAlertPayload {
  organizationId: string;
  balance: number;
}

/** Operator alert for a completed Stripe checkout or paid invoice. */
export interface IRevenueNotificationPayload {
  organizationId: string;
  /** `BillingRevenueSource` value, e.g. `subscription_invoice`. */
  source: string;
  /** Human-readable plan/product name when known, e.g. `Pro`, `Scale`. */
  planLabel?: string;
  amountMinor: number;
  currency: string;
  userId?: string | null;
}
