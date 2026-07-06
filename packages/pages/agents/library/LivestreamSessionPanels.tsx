'use client';

import type { LivestreamSession } from '@models/automation/livestream-session.model';
import Card from '@ui/card/Card';

type Props = {
  recentDeliveries: NonNullable<LivestreamSession['deliveryHistory']>;
  session: LivestreamSession | null;
};

export default function LivestreamSessionPanels({
  recentDeliveries,
  session,
}: Props) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-6">
        <h2 className="text-sm font-medium tracking-tight">Current Context</h2>
        <div className="mt-4 space-y-2 text-sm">
          <p>
            <span className="font-medium">Source:</span>{' '}
            {session?.context.source || 'none'}
          </p>
          <p>
            <span className="font-medium">Topic:</span>{' '}
            {session?.context.currentTopic || 'No active topic'}
          </p>
          <p>
            <span className="font-medium">Summary:</span>{' '}
            {session?.context.transcriptSummary || 'No transcript summary yet'}
          </p>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-sm font-medium tracking-tight">
          Recent Deliveries
        </h2>
        <div className="mt-4 space-y-3">
          {recentDeliveries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No delivery events yet.
            </p>
          ) : (
            recentDeliveries.map((delivery) => (
              <div
                key={delivery.id}
                className="rounded-lg bg-secondary p-3 text-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">
                    {delivery.platform.toUpperCase()} · {delivery.status}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {delivery.createdAt || 'just now'}
                  </span>
                </div>
                <p className="mt-2 text-muted-foreground">{delivery.message}</p>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
