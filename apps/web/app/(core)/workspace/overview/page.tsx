'use client';

import { apiClient } from '@/lib/api/client';
import { Boxes, CheckCircle2, CircleDot, Clock, Clapperboard, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

interface Task {
  _id: string;
  title: string;
  status: string;
  updatedAt: string;
}
interface ActivityEvent {
  _id: string;
  action: string;
  entityName: string | null;
  actorName: string | null;
  createdAt: string;
}
interface TaskStats {
  total: number;
  byStatus: Record<string, number>;
}

const STATUS_DOT: Record<string, string> = {
  backlog: 'border-neutral-500',
  blocked: 'border-red-400',
  done: 'border-green-400',
  in_progress: 'border-yellow-400',
  in_review: 'border-violet-400',
  todo: 'border-blue-400',
};

function timeAgo(date: string): string {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const VERBS: Record<string, string> = {
  'execution.completed': 'completed execution for',
  'execution.failed': 'failed execution for',
  'execution.started': 'started execution for',
  'task.created': 'created',
  'task.deleted': 'deleted',
  'task.updated': 'updated',
  'workflow.created': 'created workflow',
};

export default function WorkspaceOverviewPage() {
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);

  useEffect(() => {
    const ctrl = new AbortController();
    Promise.all([
      apiClient.get('/api/tasks/stats').catch(() => ({ byStatus: {}, total: 0 })),
      apiClient.get('/api/tasks').catch(() => []),
      apiClient.get('/api/activity?limit=15').catch(() => []),
    ]).then(([s, t, a]) => {
      if (!ctrl.signal.aborted) {
        setStats(s as TaskStats);
        setTasks(Array.isArray(t) ? (t as Task[]).slice(0, 10) : []);
        setActivity(Array.isArray(a) ? (a as ActivityEvent[]) : []);
      }
    });
    return () => ctrl.abort();
  }, []);

  const ip = stats?.byStatus?.in_progress ?? 0;
  const done = stats?.byStatus?.done ?? 0;
  const open = (stats?.total ?? 0) - done - (stats?.byStatus?.cancelled ?? 0);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="mb-6 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
        Dashboard
      </h1>

      <div className="mb-8 grid grid-cols-2 gap-px border border-border lg:grid-cols-4">
        {[
          { icon: CircleDot, label: 'Total Tasks', sub: null, value: stats?.total ?? 0 },
          { icon: Clock, label: 'In Progress', sub: `${open} open`, value: ip },
          { icon: CheckCircle2, label: 'Completed', sub: null, value: done },
          { icon: Boxes, label: 'Pending Review', sub: null, value: 0 },
        ].map((c) => (
          <div key={c.label} className="px-5 py-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-3xl font-semibold tabular-nums">{c.value}</p>
                <p className="mt-1 text-sm text-muted-foreground">{c.label}</p>
                {c.sub && <p className="mt-1 text-xs text-muted-foreground/70">{c.sub}</p>}
              </div>
              <c.icon className="h-4 w-4 text-muted-foreground/50" />
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="mb-4 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Recent Activity
          </h2>
          <div className="border border-border">
            {activity.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                No activity yet.
              </p>
            ) : (
              activity.map((e) => (
                <div
                  key={e._id}
                  className="flex gap-3 border-b border-border px-4 py-2.5 text-sm last:border-b-0"
                >
                  <p className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{e.actorName ?? 'System'}</span>
                    <span className="ml-1 text-muted-foreground">
                      {VERBS[e.action] ?? e.action.replace(/[._]/g, ' ')}{' '}
                    </span>
                    {e.entityName && <span className="font-medium">{e.entityName}</span>}
                  </p>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {timeAgo(e.createdAt)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <h2 className="mb-4 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Recent Tasks
          </h2>
          <div className="border border-border">
            {tasks.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">No tasks yet.</p>
            ) : (
              tasks.map((t) => (
                <Link
                  key={t._id}
                  href={`/tasks/${t._id}`}
                  className="flex items-center gap-2 border-b border-border px-4 py-2.5 text-sm no-underline transition-colors last:border-b-0 hover:bg-accent/50"
                >
                  <span
                    className={`inline-flex h-4 w-4 shrink-0 rounded-full border-2 ${STATUS_DOT[t.status] ?? 'border-neutral-500'}`}
                  />
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {timeAgo(t.updatedAt)}
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="mb-4 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Tools
        </h2>
        <div className="grid gap-px border border-border md:grid-cols-3">
          {[
            { d: 'Build node-based AI pipelines', h: '/workflows', i: Boxes, l: 'Workflows' },
            { d: 'Quick generation with prompt bar', h: '/studio', i: Sparkles, l: 'Studio' },
            { d: 'Compose and export media', h: '/editor', i: Clapperboard, l: 'Editor' },
          ].map((a) => (
            <Link
              key={a.h}
              href={a.h}
              className="group px-5 py-5 text-inherit no-underline transition-colors hover:bg-accent/50"
            >
              <a.i className="mb-3 h-5 w-5 text-muted-foreground" />
              <h3 className="font-medium">{a.l}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{a.d}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
