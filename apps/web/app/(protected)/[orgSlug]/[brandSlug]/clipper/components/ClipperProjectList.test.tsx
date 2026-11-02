import '@testing-library/jest-dom/vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClipperProjectSummary } from '@/props/studio/clipper.props';
import ClipperProjectList from './ClipperProjectList';

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

const projects: ClipperProjectSummary[] = Array.from(
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
    sourceVideoUrl: 'https://www.youtube.com/watch?v=zjXzkB8z5xg',
  }),
);

describe('ClipperProjectList', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        disconnect() {}
        observe() {}
        unobserve() {}
      },
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it('lists every project as a row that opens it', () => {
    render(<ClipperProjectList projects={projects} isLoading={false} />);

    const rows = screen.getAllByRole('link', { name: 'Open' });
    expect(rows).toHaveLength(6);
    expect(rows[0]).toHaveAttribute('href', '/acme/brand/clipper/project-0');
    expect(screen.getByText('Project 5')).toBeVisible();
    expect(screen.getAllByText('2 clips')).toHaveLength(6);
  });
  it('keeps rename/delete in overflow and retains the list after mutation failure', async () => {
    const rename = vi.fn().mockResolvedValue(undefined);
    const remove = vi.fn().mockRejectedValue(new Error('offline'));
    render(
      <ClipperProjectList
        projects={projects}
        isLoading={false}
        onRename={rename}
        onDelete={remove}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    const all = within(screen.getByTestId('clipper-project-list'));
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
  it('shows a loading list while the projects load', () => {
    const { rerender } = render(
      <ClipperProjectList projects={[]} isLoading={false} />,
    );
    expect(screen.queryByRole('link', { name: 'Open' })).toBeNull();
    rerender(<ClipperProjectList projects={[]} isLoading />);
    expect(screen.getByTestId('clipper-project-list-loading')).toBeVisible();
  });
});
