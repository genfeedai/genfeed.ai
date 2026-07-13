import * as Sentry from '@sentry/nextjs';
import type { MessagesActionKind } from './messages-surface.helpers';

export type MessagesSurfaceTelemetryData = {
  action: MessagesActionKind | 'attach-reference' | 'realtime-refresh';
  connectionState?: 'connected' | 'connecting' | 'offline' | 'reconnecting';
  outcome: 'blocked' | 'failed' | 'started' | 'succeeded';
  referenceKind?: 'social-conversation' | 'social-message';
};

export function captureMessagesSurfaceEvent(
  data: MessagesSurfaceTelemetryData,
): void {
  Sentry.addBreadcrumb({
    category: 'messages.surface',
    data,
    level: data.outcome === 'failed' ? 'warning' : 'info',
    message: 'Messages surface interaction',
  });
}
