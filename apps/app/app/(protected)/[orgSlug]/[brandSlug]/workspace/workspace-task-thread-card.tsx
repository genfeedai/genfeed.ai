'use client';

import type { WorkspaceTaskThreadCardProps } from '@props/workspace/workspace-task-thread-card.props';
import Card from '@ui/card/Card';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import {
  formatWorkspaceEventLabel,
  getWorkspaceEventMessage,
} from './workspace-task-inspector-helpers';

export function WorkspaceTaskThreadCard({
  eventStream,
}: WorkspaceTaskThreadCardProps) {
  return (
    <Card
      label="Task thread"
      bodyClassName="space-y-3 border-l border-border p-4 text-sm text-foreground/75"
    >
      <div
        className="divide-y divide-border"
        data-testid="workspace-task-events"
      >
        {[...eventStream]
          .slice()
          .sort((left, right) =>
            (right.timestamp ?? '').localeCompare(left.timestamp ?? ''),
          )
          .map((event) => {
            const message = getWorkspaceEventMessage(event);

            return (
              <article key={event.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-foreground">
                    {formatWorkspaceEventLabel(event)}
                  </p>
                  <ClientFormattedDate
                    className="text-xs text-foreground/40"
                    value={event.timestamp}
                  />
                </div>
                {message ? (
                  <p className="mt-2 text-sm text-foreground/60">{message}</p>
                ) : null}
              </article>
            );
          })}
      </div>
    </Card>
  );
}
