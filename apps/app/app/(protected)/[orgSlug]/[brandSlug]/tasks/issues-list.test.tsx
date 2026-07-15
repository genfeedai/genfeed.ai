import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import IssuesList from './issues-list';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    list: mocks.list,
  }),
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
    mocks.list.mockReset();
    mocks.list.mockResolvedValue([]);
  });

  it('names the view controls and exposes their selected state', async () => {
    render(<IssuesList />);

    expect(await screen.findByText('No tasks found')).toBeVisible();

    const listView = screen.getByRole('button', { name: 'List view' });
    const kanbanView = screen.getByRole('button', { name: 'Kanban view' });

    expect(screen.getByRole('group', { name: 'Task view' })).toBeVisible();
    expect(listView).toHaveAttribute('aria-pressed', 'true');
    expect(kanbanView).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(kanbanView);

    expect(listView).toHaveAttribute('aria-pressed', 'false');
    expect(kanbanView).toHaveAttribute('aria-pressed', 'true');
  });
});
