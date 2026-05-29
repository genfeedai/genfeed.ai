'use client';

import type { TaskEvent } from '@services/management/tasks.service';
import Card from '@ui/card/Card';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import {
  formatWorkspaceEventLabel,
  getWorkspaceEventMessage,
} from './workspace-task-inspector-helpers';

interface WorkspaceTaskThreadCardProps {
  eventStream: TaskEvent[];
}

export function WorkspaceTaskThreadCard({
  eventStream,
}: WorkspaceTaskThreadCardProps) {
  return (
    <Card
      label="Task thread"
      bodyClassName="space-y-3 border-l border-sky-400/30 p-4 text-sm text-foreground/75"
    >
      <div className="space-y-3" data-testid="workspace-task-events">
        {[...eventStream]
          .slice()
          .sort((left, right) =>
            (right.timestamp ?? '').localeCompare(left.timestamp ?? ''),
          )
          .map((event) => {
            const message = getWorkspaceEventMessage(event);

            return (
              <article
                key={event.id}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
              >
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
