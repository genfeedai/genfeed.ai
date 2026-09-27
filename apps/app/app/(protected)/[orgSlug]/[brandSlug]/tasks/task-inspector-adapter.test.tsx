import {
  ContextSidebarOutlet,
  ContextSidebarProvider,
  useContextSidebar,
} from '@contexts/ui/context-sidebar-context';
import type { Task } from '@services/management/tasks.service';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { type ReactNode, useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TaskInspectorAdapter from './task-inspector-adapter';
import {
  TaskSelectionProvider,
  useTaskSelection,
} from './task-selection-context';

const mocks = vi.hoisted(() => ({
  pathname: '/acme/brand/workspace/tasks',
  replace: vi.fn(),
  resolvers: new Map<string, () => Promise<unknown>>(),
  searchParams: new URLSearchParams('taskId=task-101'),
  updateTask: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => mocks.searchParams,
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/brand${path}` }),
}));

// A stable resolver per factory, like the real `useCallback`-backed hook, so
// effects keyed on it do not re-fire every render.
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => {
    const key = factory.toString();
    const existing = mocks.resolvers.get(key);
    if (existing) return existing;
    const resolver = async () => factory('token');
    mocks.resolvers.set(key, resolver);
    return resolver;
  },
}));

vi.mock('@services/management/tasks.service', () => ({
  TasksService: {
    getInstance: () => ({ updateTask: mocks.updateTask }),
  },
}));

vi.mock('@services/management/task-comments.service', () => ({
  TaskCommentsService: {
    getInstanceForTask: () => ({ list: () => Promise.resolve([]) }),
  },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: { getInstance: () => ({ error: vi.fn() }) },
}));

vi.mock('../workspace/use-planning-conversation', () => ({
  usePlanningConversation: () => ({ openPlanningConversation: vi.fn() }),
}));

// The detail body is covered by its own tests; this suite owns the wiring.
vi.mock('../workspace/workspace-task-inspector', () => ({
  WorkspaceTaskDetail: ({
    leading,
    task,
  }: {
    leading: ReactNode;
    task: Task;
  }) => (
    <div data-testid="workspace-task-inspector">
      {leading}
      <p>Status: {task.status}</p>
    </div>
  ),
}));

vi.mock('./task-pills', () => ({
  TaskPrioritySelect: () => null,
  TaskStatusSelect: ({ onChange }: { onChange: (status: string) => void }) => (
    <button type="button" onClick={() => onChange('done')}>
      Mark done
    </button>
  ),
}));

const TASK = {
  id: 'task-101',
  identifier: 'GEN-101',
  priority: 'high',
  status: 'todo',
  title: 'Regression in task orchestration',
} as Task;

/** Stands in for the list: resolves `?taskId=` into the shared selection. */
function ListSelection() {
  const selection = useTaskSelection();
  const selectTask = selection?.selectTask;

  useEffect(() => {
    selectTask?.(TASK);
  }, [selectTask]);

  return <p data-testid="revision">{selection?.revision}</p>;
}

function ShellCloseControl() {
  const contextSidebar = useContextSidebar();

  return (
    <button type="button" onClick={contextSidebar?.close}>
      Close sidebar
    </button>
  );
}

function renderTasksLayout() {
  return render(
    <ContextSidebarProvider>
      <ShellCloseControl />
      <ContextSidebarOutlet testId="context-sidebar-outlet" />
      <TaskSelectionProvider>
        <TaskInspectorAdapter />
        <ListSelection />
      </TaskSelectionProvider>
    </ContextSidebarProvider>,
  );
}

describe('TaskInspectorAdapter', () => {
  beforeEach(() => {
    mocks.replace.mockClear();
    mocks.searchParams = new URLSearchParams('taskId=task-101');
    mocks.updateTask.mockReset();
    mocks.updateTask.mockResolvedValue({ ...TASK, status: 'done' });
  });

  it('commits a status edit from the sidebar back through the task selection', async () => {
    renderTasksLayout();

    const outlet = screen.getByTestId('context-sidebar-outlet');
    expect(outlet).toHaveTextContent('Status: todo');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Mark done' }));
    });

    expect(mocks.updateTask).toHaveBeenCalledWith('task-101', {
      status: 'done',
    });
    await waitFor(() => expect(outlet).toHaveTextContent('Status: done'));
    // The list refetches on the bumped revision.
    expect(screen.getByTestId('revision')).toHaveTextContent('1');
  });

  it('clears ?taskId= when the sidebar closes', () => {
    mocks.searchParams = new URLSearchParams('taskId=task-101&view=list');
    renderTasksLayout();

    fireEvent.click(screen.getByRole('button', { name: 'Close sidebar' }));

    expect(mocks.replace).toHaveBeenCalledWith(
      '/acme/brand/workspace/tasks?view=list',
      { scroll: false },
    );
  });

  it('stays closed on the full task page, where no ?taskId= names the selection', () => {
    mocks.searchParams = new URLSearchParams();
    renderTasksLayout();

    expect(screen.getByTestId('context-sidebar-outlet')).toBeEmptyDOMElement();
  });

  it('keeps a click as a user selection when ?taskId= re-resolves the same task', () => {
    const { result } = renderHook(() => useTaskSelection(), {
      wrapper: TaskSelectionProvider,
    });

    act(() => result.current?.selectTask(TASK, 'user'));
    act(() => result.current?.selectTask(TASK));
    expect(result.current?.selectionOrigin).toBe('user');

    // A different task restored from the URL is automatic.
    act(() => result.current?.selectTask({ ...TASK, id: 'task-102' } as Task));
    expect(result.current?.selectionOrigin).toBe('automatic');
  });
});
