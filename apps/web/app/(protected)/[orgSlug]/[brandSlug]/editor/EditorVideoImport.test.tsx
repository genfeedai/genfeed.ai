// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createProject: vi.fn(),
  getEditorService: vi.fn(),
  loggerError: vi.fn(),
  replace: vi.fn(),
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
}));

const { default: EditorVideoImport } = await import('./EditorVideoImport');

describe('EditorVideoImport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createProject.mockResolvedValue({ id: 'project-1' });
    mocks.getEditorService.mockResolvedValue({
      create: mocks.createProject,
    });
  });

  it('seeds a project with every video in URL order and opens it in the current org scope', async () => {
    render(<EditorVideoImport videoIds={['shot-2', 'shot-1', 'shot-3']} />);

    await waitFor(() => {
      expect(mocks.createProject).toHaveBeenCalledWith({
        name: 'Video Edit',
        sourceVideoIds: ['shot-2', 'shot-1', 'shot-3'],
      });
    });
    expect(mocks.replace).toHaveBeenCalledWith('/acme/~/editor/project-1');
  });

  it('returns to the Editor workspace when the seeded create fails', async () => {
    mocks.createProject.mockRejectedValue(new Error('Source video not found'));

    render(<EditorVideoImport videoIds={['gone']} />);

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/acme/~/editor');
    });
  });
});
