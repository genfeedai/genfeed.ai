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

  it('names the view controls and exposes their selected state', async () => {
    render(<IssuesList />);

    expect(await screen.findByText('No tasks found')).toBeVisible();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Tasks' }),
    ).toHaveClass('sr-only');

    const listView = screen.getByRole('radio', { name: 'List view' });
    const kanbanView = screen.getByRole('radio', { name: 'Kanban view' });

    expect(screen.getByRole('radiogroup', { name: 'View' })).toBeVisible();
    expect(listView).toHaveAttribute('aria-checked', 'true');
    expect(kanbanView).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(kanbanView);

    expect(listView).toHaveAttribute('aria-checked', 'false');
    expect(kanbanView).toHaveAttribute('aria-checked', 'true');
  });
});
