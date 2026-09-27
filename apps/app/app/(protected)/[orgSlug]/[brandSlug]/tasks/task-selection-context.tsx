import type { TaskSelectionContextValue } from '@props/tasks/task-selection-context.props';
import type { ContextSidebarSelectionOrigin } from '@props/ui/context-sidebar.props';
import type { Task } from '@services/management/tasks.service';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

const TaskSelectionContext = createContext<TaskSelectionContextValue | null>(
  null,
);

/**
 * Shares the task opened from the list with the workspace inspector rail.
 * The URL (`?taskId=`) stays the source of truth for *which* task; this holds
 * the resolved record so the rail never refetches what the list already has.
 */
export function TaskSelectionProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [selection, setSelection] = useState<{
    readonly origin: ContextSidebarSelectionOrigin;
    readonly task: Task | null;
  }>({ origin: 'automatic', task: null });
  const [revision, setRevision] = useState(0);
  const selectedTask = selection.task;
  const selectionOrigin = selection.origin;

  // Resolving `?taskId=` after a click re-selects the same task automatically;
  // that must not downgrade the click to an automatic selection.
  const selectTask = useCallback(
    (
      task: Task | null,
      origin: ContextSidebarSelectionOrigin = 'automatic',
    ) => {
      setSelection((current) => ({
        origin:
          origin === 'automatic' && task && current.task?.id === task.id
            ? current.origin
            : origin,
        task,
      }));
    },
    [],
  );

  const commitTask = useCallback((task: Task) => {
    setSelection((current) => ({ origin: current.origin, task }));
    setRevision((current) => current + 1);
  }, []);

  const value = useMemo(
    () => ({
      commitTask,
      revision,
      selectedTask,
      selectionOrigin,
      selectTask,
    }),
    [commitTask, revision, selectTask, selectedTask, selectionOrigin],
  );

  return (
    <TaskSelectionContext.Provider value={value}>
      {children}
    </TaskSelectionContext.Provider>
  );
}

/** `null` when rendered outside the tasks layout (tests, embeds). */
export function useTaskSelection(): TaskSelectionContextValue | null {
  return useContext(TaskSelectionContext);
}
