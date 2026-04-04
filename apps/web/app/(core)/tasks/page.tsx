'use client';

import { apiClient } from '@/lib/api/client';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

interface Task {
  _id: string;
  title: string;
  status: string;
  priority: string;
  assignee: string | null;
  inputPreview: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_DOT: Record<string, string> = {
  backlog: 'border-neutral-500 text-neutral-500',
  blocked: 'border-red-400 text-red-400',
  cancelled: 'border-neutral-500 text-neutral-500',
  done: 'border-green-400 text-green-400',
  in_progress: 'border-yellow-400 text-yellow-400',
  in_review: 'border-violet-400 text-violet-400',
  todo: 'border-blue-400 text-blue-400',
};

const STATUS_ORDER = [
  'in_progress',
  'in_review',
  'todo',
  'blocked',
  'backlog',
  'done',
  'cancelled',
];

function statusLabel(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
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

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPrompt, setNewPrompt] = useState('');
  const [newContentType, setNewContentType] = useState<'image' | 'video' | 'text'>('image');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    apiClient
      .get('/api/tasks')
      .then((data) => {
        if (!ctrl.signal.aborted) {
          setTasks(Array.isArray(data) ? (data as Task[]) : []);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setIsLoading(false);
      });
    return () => ctrl.abort();
  }, []);

  async function createTask() {
    if (!newTitle.trim()) return;
    setIsCreating(true);

    try {
      if (newPrompt.trim()) {
        // Create and execute — generates content
        const result = (await apiClient.post('/api/tasks/execute', {
          contentType: newContentType,
          prompt: newPrompt.trim(),
          title: newTitle.trim(),
        })) as { task: Task; executionId: string };
        setTasks((prev) => [result.task, ...prev]);
      } else {
        // Plain task — no execution
        const task = (await apiClient.post('/api/tasks', { title: newTitle.trim() })) as Task;
        setTasks((prev) => [task, ...prev]);
      }
      setNewTitle('');
      setNewPrompt('');
      setShowNewTask(false);
    } finally {
      setIsCreating(false);
    }
  }

  // Group by status
  const grouped = new Map<string, Task[]>();
  for (const status of STATUS_ORDER) {
    const matching = tasks.filter((t) => t.status === status);
    if (matching.length > 0) grouped.set(status, matching);
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Tasks
        </h1>
        <button
          type="button"
          onClick={() => setShowNewTask(true)}
          className="flex items-center gap-1.5 border border-border px-3 py-1.5 text-sm transition-colors hover:bg-accent/50"
        >
          <Plus className="h-3.5 w-3.5" />
          New Task
        </button>
      </div>

      {showNewTask && (
        <div className="mb-6 border border-border p-4">
          <input
            className="mb-3 w-full bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setShowNewTask(false);
            }}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Task title..."
            value={newTitle}
          />
          <textarea
            className="mb-3 w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            onChange={(e) => setNewPrompt(e.target.value)}
            placeholder="Describe what to generate... (leave empty for a plain task)"
            rows={3}
            value={newPrompt}
          />
          {newPrompt.trim() && (
            <div className="mb-3 flex gap-1">
              {(['image', 'video', 'text'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setNewContentType(type)}
                  className={`px-3 py-1 text-xs capitalize transition-colors ${
                    newContentType === type
                      ? 'border border-foreground/30 text-foreground'
                      : 'border border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              className="border border-border px-3 py-1 text-xs transition-colors hover:bg-accent/50 disabled:opacity-50"
              disabled={isCreating || !newTitle.trim()}
              onClick={createTask}
            >
              {isCreating ? 'Creating...' : newPrompt.trim() ? 'Create & Generate' : 'Create'}
            </button>
            <button
              type="button"
              className="px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setShowNewTask(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="py-20 text-center text-sm text-muted-foreground">Loading...</p>
      ) : tasks.length === 0 ? (
        <p className="py-20 text-center text-sm text-muted-foreground">
          No tasks yet. Create one to get started.
        </p>
      ) : (
        <div className="border border-border">
          {Array.from(grouped.entries()).map(([status, statusTasks]) => (
            <div key={status}>
              <div className="flex items-center gap-2 border-b border-border bg-accent/30 px-4 py-2">
                <span
                  className={`inline-flex h-3.5 w-3.5 rounded-full border-2 ${(STATUS_DOT[status] ?? 'border-neutral-500').split(' ')[0]}`}
                />
                <span className="text-xs font-medium uppercase tracking-wide">
                  {statusLabel(status)}
                </span>
                <span className="text-xs text-muted-foreground">{statusTasks.length}</span>
              </div>
              {statusTasks.map((task) => (
                <Link
                  key={task._id}
                  href={`/tasks/${task._id}`}
                  className="flex items-center gap-2 border-b border-border px-4 py-2.5 text-sm no-underline transition-colors last:border-b-0 hover:bg-accent/50"
                >
                  <span
                    className={`inline-flex h-4 w-4 shrink-0 rounded-full border-2 ${(STATUS_DOT[task.status] ?? 'border-neutral-500').split(' ')[0]}`}
                  />
                  <span className="min-w-0 flex-1 truncate">{task.title}</span>
                  {task.inputPreview && (
                    <span className="max-w-[200px] shrink-0 truncate text-xs text-muted-foreground">
                      {task.inputPreview}
                    </span>
                  )}
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {timeAgo(task.updatedAt)}
                  </span>
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
