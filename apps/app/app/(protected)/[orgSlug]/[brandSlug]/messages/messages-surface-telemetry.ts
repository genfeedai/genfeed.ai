import type { MessagesSurfaceTelemetryData } from '@genfeedai/props/messages/messages-surface-telemetry.props';

import * as Sentry from '@sentry/nextjs';

export type { MessagesSurfaceTelemetryData } from '@genfeedai/props/messages/messages-surface-telemetry.props';

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
