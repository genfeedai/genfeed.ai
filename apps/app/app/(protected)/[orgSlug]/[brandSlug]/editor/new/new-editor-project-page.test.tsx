// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createProject: vi.fn(),
  getEditorService: vi.fn(),
  loggerError: vi.fn(),
  replace: vi.fn(),
  searchParamsGet: vi.fn(),
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
  useRouter: () => ({
    replace: mocks.replace,
  }),
  useSearchParams: () => ({
    get: mocks.searchParamsGet,
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
    mocks.searchParamsGet.mockReturnValue(null);
  });

  it('creates a project and redirects through the current org URL scope', async () => {
    render(<NewEditorProjectPage />);

    await waitFor(() => {
      expect(mocks.createProject).toHaveBeenCalledWith({
        name: 'Untitled Project',
        sourceVideoId: undefined,
      });
    });
    expect(mocks.replace).toHaveBeenCalledWith('/acme/~/editor/project-1');
  });
});
