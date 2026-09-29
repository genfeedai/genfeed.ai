// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createProject: vi.fn(),
  getEditorService: vi.fn(),
  loggerError: vi.fn(),
  replace: vi.fn(),
  searchParamsGetAll: vi.fn(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getEditorService,
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/acme/~${path}`,
  }),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: mocks.loggerError,
  },
}));

vi.mock('@services/editor/editor-projects.service', () => ({
  EditorProjectsService: {
    getInstance: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({
    replace: mocks.replace,
  }),
  useSearchParams: () => ({
    getAll: mocks.searchParamsGetAll,
  }),
}));

const { default: NewEditorProjectPage } = await import(
  './new-editor-project-page'
);

describe('NewEditorProjectPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createProject.mockResolvedValue({ id: 'project-1' });
    mocks.getEditorService.mockResolvedValue({
      create: mocks.createProject,
    });
    mocks.searchParamsGetAll.mockReturnValue([]);
  });

  it('creates a project and redirects through the current org URL scope', async () => {
    render(<NewEditorProjectPage />);

    await waitFor(() => {
      expect(mocks.createProject).toHaveBeenCalledWith({
        name: 'Untitled Project',
        sourceVideoIds: [],
      });
    });
    expect(mocks.replace).toHaveBeenCalledWith(
      '/acme/~/studio/editor/project-1',
    );
  });

  it('seeds every ?video= in URL order', async () => {
    mocks.searchParamsGetAll.mockImplementation((key: string) =>
      key === 'video' ? ['shot-2', 'shot-1', 'shot-3'] : [],
    );

    render(<NewEditorProjectPage />);

    await waitFor(() => {
      expect(mocks.createProject).toHaveBeenCalledWith({
        name: 'Video Edit',
        sourceVideoIds: ['shot-2', 'shot-1', 'shot-3'],
      });
    });
  });

  it('returns to the Editor list when the seeded create fails', async () => {
    mocks.searchParamsGetAll.mockReturnValue(['gone']);
    mocks.createProject.mockRejectedValue(new Error('Source video not found'));

    render(<NewEditorProjectPage />);

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/acme/~/studio/editor');
    });
  });
});
