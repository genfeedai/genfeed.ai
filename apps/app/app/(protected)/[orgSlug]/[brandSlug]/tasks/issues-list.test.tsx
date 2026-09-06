import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openIssueOverlay } from './issue-overlay-controls';
import IssuesList from './issues-list';

const mocks = vi.hoisted(() => ({
  findOne: vi.fn(),
  getService: vi.fn(),
  list: vi.fn(),
  notifyError: vi.fn(),
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
  updateTask: vi.fn(),
}));

vi.mock('@services/core/notifications.service', () => ({
  notificationsService: { error: mocks.notifyError },
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ brandId: null }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: mocks.replace }),
  useSearchParams: () => mocks.searchParams,
}));

vi.mock('./issue-overlay', () => ({
  default: () => null,
}));

vi.mock('./issue-overlay-controls', () => ({
  openIssueOverlay: vi.fn(),
  closeIssueOverlay: vi.fn(),
}));

describe('IssuesList view controls', () => {
  beforeEach(() => {
    mocks.getService.mockReset();
    mocks.list.mockReset();
    mocks.list.mockResolvedValue([]);
    mocks.getService.mockResolvedValue({ list: mocks.list });
  });

  it('shows a table skeleton while loading before the empty card', async () => {
    let resolveList: (value: unknown[]) => void = () => undefined;
    mocks.list.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveList = resolve;
      }),
    );

    render(<IssuesList />);

    expect(screen.getByTestId('skeleton-table')).toBeVisible();
    expect(screen.queryByText('No tasks yet')).not.toBeInTheDocument();
    expect(screen.queryByText('All Statuses')).not.toBeInTheDocument();

    resolveList([]);

    expect(await screen.findByText('No tasks yet')).toBeVisible();
    expect(screen.queryByTestId('skeleton-table')).not.toBeInTheDocument();
  });

  it('start-empty surface is only the empty card with a create CTA (no toolbar)', async () => {
    render(<IssuesList />);

    expect(await screen.findByText('No tasks yet')).toBeVisible();
    expect(
      screen.getByText(
        'Create a task to start tracking work in this workspace.',
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Tasks' }),
    ).toHaveClass('sr-only');

    // Primary CTA lives inside the empty card, not the action bar.
    expect(screen.getByRole('button', { name: 'New Task' })).toBeVisible();
    expect(
      screen.queryByRole('group', { name: 'View' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('All Statuses')).not.toBeInTheDocument();
  });

  it('names the view controls and exposes their selected state once tasks exist', async () => {
    mocks.list.mockResolvedValue([
      {
        id: 'task-1',
        identifier: 'TASK-1',
        priority: 'medium',
        status: 'todo',
        title: 'Ship empty-state CTA',
        updatedAt: new Date().toISOString(),
      },
    ]);

    render(<IssuesList />);

    expect(await screen.findByText('Ship empty-state CTA')).toBeVisible();

    const listView = screen.getByRole('radio', { name: 'List view' });
    const kanbanView = screen.getByRole('radio', { name: 'Kanban view' });

    expect(screen.getByRole('group', { name: 'View' })).toBeVisible();
    expect(listView).toHaveAttribute('aria-checked', 'true');
    expect(kanbanView).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(kanbanView);

    expect(listView).toHaveAttribute('aria-checked', 'false');
    expect(kanbanView).toHaveAttribute('aria-checked', 'true');
  });
});

it('keeps failed tasks visible in the shared table and opens their details', async () => {
  mocks.list.mockResolvedValue([
    {
      id: 'failed-task',
      identifier: 'QA-9',
      priority: 'high',
      status: 'failed',
      title: 'Recover the failed publish',
      updatedAt: new Date().toISOString(),
    },
  ]);
  mocks.getService.mockResolvedValue({ list: mocks.list });
  render(<IssuesList />);
  const title = await screen.findByRole('button', {
    name: /Recover the failed publish/,
  });
  expect(screen.getByRole('table', { name: 'Tasks' })).toBeVisible();
  expect(screen.getByRole('columnheader', { name: 'Task' })).toBeVisible();
  expect(
    screen.queryByRole('columnheader', { name: 'Updated' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('combobox', { name: 'Status for QA-9' }),
  ).toBeVisible();
  expect(
    screen.getByRole('combobox', { name: 'Priority for QA-9' }),
  ).toBeVisible();
  expect(screen.getAllByText('Failed')).toHaveLength(1);
  fireEvent.click(title);
  expect(openIssueOverlay).toHaveBeenCalled();
  expect(mocks.replace).toHaveBeenCalledWith('/?taskId=failed-task', {
    scroll: false,
  });
});

describe('IssuesList inline editing and deep links', () => {
  const failedTask = {
    id: 'failed-task',
    identifier: 'QA-9',
    priority: 'high',
    status: 'failed',
    title: 'Recover the failed publish',
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParams = new URLSearchParams();
    mocks.list.mockResolvedValue([failedTask]);
    mocks.updateTask.mockResolvedValue(failedTask);
    mocks.getService.mockResolvedValue({
      findOne: mocks.findOne,
      list: mocks.list,
      updateTask: mocks.updateTask,
    });
  });

  it('opens a task from the taskId query param without a list hit', async () => {
    mocks.searchParams = new URLSearchParams('taskId=missing-task');
    mocks.findOne.mockResolvedValue({ ...failedTask, id: 'missing-task' });

    render(<IssuesList />);

    await waitFor(() =>
      expect(mocks.findOne).toHaveBeenCalledWith('missing-task'),
    );
    await waitFor(() => expect(openIssueOverlay).toHaveBeenCalled());
    expect(mocks.notifyError).not.toHaveBeenCalled();
  });

  it('reports a task that cannot be opened from the taskId query param', async () => {
    mocks.searchParams = new URLSearchParams('taskId=gone');
    mocks.findOne.mockRejectedValue(new Error('not found'));

    render(<IssuesList />);

    await waitFor(() =>
      expect(mocks.notifyError).toHaveBeenCalledWith('Could not open task.'),
    );
    expect(openIssueOverlay).not.toHaveBeenCalled();
  });

  it('updates status inline and reloads the list', async () => {
    render(<IssuesList />);
    const trigger = await screen.findByRole('combobox', {
      name: 'Status for QA-9',
    });

    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole('option', { name: 'Done' }));

    await waitFor(() =>
      expect(mocks.updateTask).toHaveBeenCalledWith('failed-task', {
        status: 'done',
      }),
    );
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
    expect(openIssueOverlay).not.toHaveBeenCalled();
  });

  it('surfaces a failed inline update', async () => {
    mocks.updateTask.mockRejectedValue(new Error('boom'));
    render(<IssuesList />);
    const trigger = await screen.findByRole('combobox', {
      name: 'Priority for QA-9',
    });

    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole('option', { name: 'Critical' }));

    await waitFor(() =>
      expect(mocks.notifyError).toHaveBeenCalledWith(
        'Could not update task. Please try again.',
      ),
    );
  });
});
