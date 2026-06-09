export interface UnipileProviderConfig {
  allowedAccountIds: string[];
  apiBaseUrl: string;
  defaultAccountId?: string;
}

export interface UnipileConnection {
  apiKey: string;
  config: UnipileProviderConfig;
  organizationId: string;
  source: 'environment' | 'organization';
}

export interface UnipileIntegrationStatus {
  allowedAccountIds: string[];
  apiBaseUrl?: string;
  configured: boolean;
  defaultAccountId?: string;
  source?: 'environment' | 'organization';
  status?: string;
}

export interface UnipileContact {
  displayName?: string;
  identifier: string;
}

export interface UnipileAccount {
  connectionStatus?: string;
  email?: string;
  id: string;
  name?: string;
  provider?: string;
  status?: string;
  type?: string;
  username?: string;
}

export interface UnipilePaginatedResult<T> {
  cursor?: string | null;
  items: T[];
}

export interface UnipileSendEmailInput {
  accountId: string;
  bcc?: UnipileContact[];
  body: string;
  cc?: UnipileContact[];
  replyTo?: string;
  subject: string;
  to: UnipileContact[];
  trackingOptions?: {
    label?: string;
    links?: boolean;
    opens?: boolean;
  };
}

export interface UnipileSendMessageInput {
  chatId: string;
  text: string;
}

export interface UnipileListMessagesQuery {
  accountId?: string;
  chatId?: string;
  cursor?: string;
  limit?: number;
}

export interface UnipileListEmailsQuery {
  accountId?: string;
  after?: string;
  before?: string;
  cursor?: string;
  limit?: number;
  metaOnly?: boolean;
}

export interface UnipileListCalendarEventsQuery {
  accountId?: string;
  calendarId?: string;
  cursor?: string;
  limit?: number;
}

export interface UnipileCreateCalendarEventInput {
  accountId: string;
  calendarId?: string;
  description?: string;
  end: string;
  location?: string;
  start: string;
  title: string;
}

export type UnipileRawRecord = Record<string, unknown>;
