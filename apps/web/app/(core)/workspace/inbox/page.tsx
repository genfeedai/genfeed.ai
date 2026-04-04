'use client';

import { apiClient } from '@/lib/api/client';
import Link from 'next/link';
import { useEffect, useState } from 'react';

interface ActivityEvent {
  _id: string;
  action: string;
  entityType: string;
  entityId: string;
  entityName: string | null;
  entityTitle: string | null;
  actorName: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

function timeAgo(date: string): string {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatVerb(action: string, details: Record<string, unknown> | null): string {
  if (action === 'task.updated' && details) {
    const prev = (details._previous as Record<string, unknown>) ?? {};
    if (details.status !== undefined) {
      return prev.status
        ? `changed status from ${String(prev.status).replace(/_/g, ' ')} to ${String(details.status).replace(/_/g, ' ')} on`
        : `changed status to ${String(details.status).replace(/_/g, ' ')} on`;
    }
  }
  const verbs: Record<string, string> = {
    'execution.completed': 'completed execution for',
    'execution.failed': 'failed execution for',
    'execution.started': 'started execution for',
    'task.created': 'created',
    'task.deleted': 'deleted',
    'task.updated': 'updated',
    'workflow.created': 'created workflow',
    'workflow.updated': 'updated workflow',
  };
  return verbs[action] ?? action.replace(/[._]/g, ' ');
}

export default function WorkspaceInboxPage() {
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    apiClient
      .get('/api/activity?limit=50')
      .then((data) => {
        if (!ctrl.signal.aborted) {
          setActivity(Array.isArray(data) ? (data as ActivityEvent[]) : []);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setIsLoading(false);
      });
    return () => ctrl.abort();
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="mb-6 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
        Inbox
      </h1>

      {isLoading ? (
        <p className="py-20 text-center text-sm text-muted-foreground">Loading...</p>
      ) : activity.length === 0 ? (
        <p className="py-20 text-center text-sm text-muted-foreground">
          No activity yet. Create a task or run a workflow.
        </p>
      ) : (
        <div className="border border-border">
          {activity.map((event) => {
            const link = event.entityType === 'task' ? `/tasks/${event.entityId}` : null;
            const verb = formatVerb(event.action, event.details);
            const inner = (
              <div className="flex gap-3">
                <p className="min-w-0 flex-1 truncate">
                  <span className="inline-flex items-baseline gap-1">
                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-medium text-muted-foreground">
                      {(event.actorName ?? 'SY').slice(0, 2).toUpperCase()}
                    </span>
                    <span className="text-sm font-medium">{event.actorName ?? 'System'}</span>
                  </span>
                  <span className="ml-1 text-sm text-muted-foreground">{verb} </span>
                  {event.entityName && (
                    <span className="text-sm font-medium">{event.entityName}</span>
                  )}
                </p>
                <span className="shrink-0 pt-0.5 text-xs text-muted-foreground">
                  {timeAgo(event.createdAt)}
                </span>
              </div>
            );

            if (link) {
              return (
                <Link
                  key={event._id}
                  href={link}
                  className="block border-b border-border px-4 py-2.5 text-inherit no-underline transition-colors last:border-b-0 hover:bg-accent/50"
                >
                  {inner}
                </Link>
              );
            }
            return (
              <div key={event._id} className="border-b border-border px-4 py-2.5 last:border-b-0">
                {inner}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
