import * as Sentry from '@sentry/nextjs';
import type { MessagesSurfaceTelemetryData } from '@/features/messages/props/messages-surface-telemetry.props';

export type { MessagesSurfaceTelemetryData } from '@/features/messages/props/messages-surface-telemetry.props';

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
