import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import IssuesList from './issues-list';

const mocks = vi.hoisted(() => ({
  getService: vi.fn(),
  list: vi.fn(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ brandId: null }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('./issue-overlay', () => ({
  default: () => null,
}));

vi.mock('./issue-overlay-controls', () => ({
  openIssueOverlay: vi.fn(),
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
