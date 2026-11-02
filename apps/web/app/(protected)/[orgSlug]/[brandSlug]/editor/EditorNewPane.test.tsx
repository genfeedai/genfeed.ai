import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EditorNewPane from './EditorNewPane';

const mocks = vi.hoisted(() => ({
  createProject: vi.fn(),
  getEditorService: vi.fn(),
  loggerError: vi.fn(),
  push: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getEditorService,
}));
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/moonrise${path}` }),
}));
vi.mock('@services/core/logger.service', () => ({
  logger: { error: mocks.loggerError },
}));
vi.mock('@services/editor/editor-projects.service', () => ({
  EditorProjectsService: { getInstance: vi.fn() },
}));

describe('EditorNewPane', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createProject.mockResolvedValue({ id: 'project-1' });
    mocks.getEditorService.mockResolvedValue({ create: mocks.createProject });
  });

  it('opens on two ways to start and a name bar without creating anything', () => {
    render(<EditorNewPane />);

    expect(
      screen.getByRole('heading', { name: 'What are you editing?' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Blank project' })).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Edit a Library video' }),
    ).toBeVisible();
    expect(mocks.createProject).not.toHaveBeenCalled();
  });

  it('creates the named project and opens its timeline', async () => {
    render(<EditorNewPane />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Project name' }), {
      target: { value: '  Launch teaser  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(
        '/acme/moonrise/editor/project-1',
      ),
    );
    expect(mocks.createProject).toHaveBeenCalledWith({
      name: 'Launch teaser',
      sourceVideoIds: [],
    });
  });

  it('starts an untitled project from the blank card', async () => {
    render(<EditorNewPane />);

    fireEvent.click(screen.getByRole('button', { name: 'Blank project' }));

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(
        '/acme/moonrise/editor/project-1',
      ),
    );
    expect(mocks.createProject).toHaveBeenCalledWith({
      name: 'Untitled Project',
      sourceVideoIds: [],
    });
  });

  it('sends the creator to the Library to pick a video', () => {
    render(<EditorNewPane />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Edit a Library video' }),
    );

    expect(mocks.push).toHaveBeenCalledWith('/acme/moonrise/library/assets');
    expect(mocks.createProject).not.toHaveBeenCalled();
  });

  it('keeps the name and says so when the project could not be created', async () => {
    mocks.createProject.mockRejectedValue(new Error('offline'));
    render(<EditorNewPane />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Project name' }), {
      target: { value: 'Launch teaser' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not create the project. Try again.',
    );
    expect(screen.getByRole('textbox', { name: 'Project name' })).toHaveValue(
      'Launch teaser',
    );
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
