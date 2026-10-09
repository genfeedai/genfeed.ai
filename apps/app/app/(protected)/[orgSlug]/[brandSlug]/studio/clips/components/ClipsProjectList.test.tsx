import '@testing-library/jest-dom/vitest';
import type { ClipProjectSummary } from '@props/studio/clips.props';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ClipsProjectList from './ClipsProjectList';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const mocks = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/brand${path}` }),
}));
vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: { getInstance: () => ({ error: mocks.error }) },
}));

const projects: ClipProjectSummary[] = Array.from(
  { length: 6 },
  (_, index) => ({
    id: `project-${index}`,
    name: `Project ${index}`,
    createdAt: `2026-09-0${index + 1}T12:00:00Z`,
    updatedAt: `2026-09-0${index + 1}T12:00:00Z`,
    isDraft: false,
    mode: 'raw-cut',
    failedClipCount: 0,
    pendingClipCount: 0,
    readyClipCount: 2,
    progress: 100,
    status: 'completed',
  }),
);

describe('ClipsProjectList', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });
  it('defaults to rows, orders three recent cards, and persists grid only for All', async () => {
    const { unmount } = render(
      <ClipsProjectList projects={projects} isLoading={false} />,
    );
    const recent = screen.getByTestId('clips-projects-recent');
    expect(within(recent).queryByText('Project 0')).toBeNull();
    expect(recent.textContent?.indexOf('Project 5')).toBeLessThan(
      recent.textContent?.indexOf('Project 4') ?? 0,
    );
    expect(within(recent).getAllByTestId('clips-project-card')).toHaveLength(3);
    expect(within(recent).queryByText('Project 2')).toBeNull();
    await userEvent.click(screen.getByRole('radio', { name: 'Grid' }));
    expect(screen.getAllByTestId('clips-project-card')).toHaveLength(9);
    expect(within(recent).getAllByTestId('clips-project-card')).toHaveLength(3);
    unmount();
    render(<ClipsProjectList projects={projects} isLoading={false} />);
    expect(screen.getAllByTestId('clips-project-card')).toHaveLength(9);
  });
  it('keeps rename/delete in overflow and retains the list after mutation failure', async () => {
    const rename = vi.fn().mockResolvedValue(undefined);
    const remove = vi.fn().mockRejectedValue(new Error('offline'));
    render(
      <ClipsProjectList
        projects={projects}
        isLoading={false}
        onRename={rename}
        onDelete={remove}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    const all = within(screen.getByTestId('clips-projects-all'));
    fireEvent.pointerDown(
      all.getByRole('button', { name: 'Actions for Project 0' }),
    );
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Rename' }),
    );
    await userEvent.clear(
      screen.getByRole('textbox', { name: 'Project name' }),
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Project name' }),
      'New name',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(rename).toHaveBeenCalledWith('project-0', 'New name'),
    );
    fireEvent.pointerDown(
      all.getByRole('button', { name: 'Actions for Project 0' }),
    );
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Delete' }),
    );
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(all.getByText('Project 0')).toBeVisible();
    expect(all.getAllByRole('link', { name: 'Open' })).toHaveLength(6);
  });
  it('hides empty sections and follows the active view while loading', async () => {
    const { rerender } = render(
      <ClipsProjectList projects={[]} isLoading={false} />,
    );
    expect(screen.queryByTestId('clips-projects-recent')).toBeNull();
    expect(screen.queryByTestId('clips-projects-all')).toBeNull();
    rerender(<ClipsProjectList projects={[]} isLoading />);
    expect(screen.getByTestId('clips-project-list-loading')).toBeVisible();
    await userEvent.click(screen.getByRole('radio', { name: 'Grid' }));
    expect(screen.getByRole('radio', { name: 'Grid' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });
});
