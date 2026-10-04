export type SystemNotificationProvider = 'discord' | 'telegram' | 'email';

export interface ISystemNotificationDestination {
  id: string;
  label: string;
  provider: SystemNotificationProvider;
  isEnabled: boolean;
  eventTypes: string[];
  /** Discord webhook tokens are never returned. */
  address: string | null;
  hasCredentials: boolean;
}

export interface ISystemNotificationDestinationInput {
  label: string;
  provider: SystemNotificationProvider;
  isEnabled: boolean;
  eventTypes: string[];
  /** Omit to preserve an existing webhook; a new destination requires it. */
  address?: string;
}

export interface ISystemNotificationOverview {
  id: string;
  configuration: {
    enabled: boolean;
    eventTypes: string[];
    recordingEnabled: boolean;
    transportConfigured: boolean;
  };
  destinations: ISystemNotificationDestination[];
  observedSignups: number;
  signupObservationStart: string | null;
  deliveries: Array<{
    id: string;
    eventId: string;
    /** Null for an event that failed before any destination fanout. */
    destinationId: string | null;
    type: string;
    occurredAt: string;
    status: string;
    attempts: number;
    deliveredAt: string | null;
  }>;
}
