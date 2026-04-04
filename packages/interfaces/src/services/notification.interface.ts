/**
 * Notification service interfaces
 * Used by NotificationsService for type-safe notification handling
 */

export type NotificationType = 'telegram' | 'discord' | 'email' | 'bot';

export interface INotificationEvent {
  type: NotificationType;
  action: string;
  payload: INotificationPayloadTypes;
  userId?: string;
  organizationId?: string;
  timestamp?: Date;
}

export type INotificationPayloadTypes =
  | ITelegramMessagePayload
  | IEmailPayload
  | ICrmLeadOutreachEmailPayload
  | IWorkflowStatusEmailPayload
  | IVideoStatusEmailPayload
  | IDiscordCardPayload
  | IChatbotPayload
  | IPostNotificationPayload
  | IArticleNotificationPayload
  | IVercelNotificationPayload
  | IChromaticNotificationPayload
  | IUserCreatedPayload
  | IIngredientNotificationPayload
  | IModelDiscoveryNotificationPayload
  | ILowCreditsAlertPayload;

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

export interface ICrmLeadOutreachEmailPayload {
  to: string;
  leadId: string;
  leadName: string;
  company?: string;
  subject?: string;
  organizationId?: string;
}

export interface IWorkflowStatusEmailPayload {
  to: string;
  workflowId: string;
  workflowLabel: string;
  status: 'completed' | 'failed';
  error?: string;
  organizationId?: string;
  userId?: string;
}

export interface IVideoStatusEmailPayload {
  to: string;
  status: 'completed' | 'failed';
  path: string;
  jobId?: string;
  error?: string;
  organizationId?: string;
  url?: string;
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

export interface IChatbotPayload {
  sessionId: string;
  message: string;
  metadata?: IChatbotMetadata;
}

export interface IChatbotMetadata {
  source?: string;
  context?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface IPostNotificationPayload {
  platform: string;
  externalId: string;
  description?: string;
  mediaUrl?: string;
  platforms?: Array<{ platform: string; url: string }>;
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

export interface IChromaticNotificationPayload {
  embed: IDiscordEmbed;
}

export interface IUserCreatedPayload {
  _id: string;
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
  _id: string;
  label?: string;
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

export interface ILowCreditsAlertPayload {
  organizationId: string;
  balance: number;
}
