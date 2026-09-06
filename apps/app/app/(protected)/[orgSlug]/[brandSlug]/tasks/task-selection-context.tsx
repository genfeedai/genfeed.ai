import type { TaskSelectionContextValue } from '@props/tasks/task-selection-context.props';
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
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [revision, setRevision] = useState(0);

  const selectTask = useCallback((task: Task | null) => {
    setSelectedTask(task);
  }, []);

  const commitTask = useCallback((task: Task) => {
    setSelectedTask(task);
    setRevision((current) => current + 1);
  }, []);

  const value = useMemo(
    () => ({ commitTask, revision, selectTask, selectedTask }),
    [commitTask, revision, selectTask, selectedTask],
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
