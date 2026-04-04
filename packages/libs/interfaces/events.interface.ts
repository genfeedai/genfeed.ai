export interface NotificationEvent {
  type: 'telegram' | 'discord' | 'email' | 'chatbot';
  action: string;
  payload: Record<string, unknown>;
  userId?: string;
  organizationId?: string;
  timestamp?: Date;
  retryCount?: number;
}
