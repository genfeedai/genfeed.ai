import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import ClipperWorkspace from './ClipperWorkspace';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
  useStudioClipperProjects: vi.fn(),
  useStudioClipperPage: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/acme/moonrise/clipper',
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => mocks.searchParams,
}));

vi.mock('@ui/navigation/pagination/auto-pagination/AutoPagination', () => ({
  default: () => <nav aria-label="pagination" />,
}));

vi.mock('./useStudioClipperProjects', () => ({
  useStudioClipperProjects: mocks.useStudioClipperProjects,
}));

vi.mock('./useStudioClipperPage', () => ({
  useStudioClipperPage: mocks.useStudioClipperPage,
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/acme/demo${path}`,
    orgHref: (path: string) => `/acme/~${path}`,
  }),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children?: ReactNode;
    href: string;
  }) => (
    <a {...props} href={href}>
      {children}
    </a>
  ),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@/../tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

// Opaque stand-ins: this suite verifies Container/SectionTopbar chrome
// stability, not the inner forms.
vi.mock('./components/ClipperInputForm', () => ({
  default: () => <div data-testid="clipper-input-form" />,
}));

vi.mock('./components/ClipperProjectList', () => ({
  default: ({ isRecentVisible }: { isRecentVisible?: boolean }) => (
    <div
      data-recent-visible={String(isRecentVisible)}
      data-testid="clipper-project-list"
    />
  ),
}));

function baseClipperPageState(overrides: Record<string, unknown> = {}) {
  return {
    error: null,
    generationMode: 'avatar',
    handleAnalyze: vi.fn(),
    handleStartFromYoutube: vi.fn(),
    identityDefaults: { isComplete: false },
    isSubmitting: false,
    maxClips: 10,
    minViralityScore: 50,
    setGenerationMode: vi.fn(),
    setMaxClips: vi.fn(),
    setMinViralityScore: vi.fn(),
    setSourceFile: vi.fn(),
    setSourceKind: vi.fn(),
    setYoutubeUrl: vi.fn(),
    sourceFile: null,
    sourceKind: 'youtube',
    uploadProgress: 0,
    youtubeUrl: '',
    ...overrides,
  };
}

describe('ClipperWorkspace chrome stability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParams = new URLSearchParams();
    mocks.useStudioClipperPage.mockReturnValue(baseClipperPageState());
  });

  it('shows no topbar until there is an action, then puts New project in it', () => {
    mocks.useStudioClipperProjects.mockReturnValue({
      error: null,
      isLoading: false,
      projects: [],
    });

    const { rerender } = render(<ClipperWorkspace />);
    expect(screen.queryByTestId('section-topbar')).not.toBeInTheDocument();

    mocks.useStudioClipperProjects.mockReturnValue({
      error: null,
      isLoading: false,
      projects: [
        {
          failedClipCount: 0,
          id: 'clip-1',
          isDraft: false,
          name: 'Demo clip',
          pendingClipCount: 0,
          progress: 100,
          readyClipCount: 1,
          status: 'completed',
        },
      ],
    });
    rerender(<ClipperWorkspace />);
    expect(screen.getByTestId('section-topbar')).toContainElement(
      screen.getByRole('link', { name: 'New project' }),
    );
  });

  it('points an empty project list at the new-project route instead of an unsaved form', () => {
    mocks.useStudioClipperProjects.mockReturnValue({
      error: null,
      isLoading: false,
      projects: [],
    });

    render(<ClipperWorkspace />);

    expect(screen.getByTestId('clipper-empty-state')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New project' })).toHaveAttribute(
      'href',
      '/acme/demo/clipper/new',
    );
    expect(screen.queryByTestId('clipper-input-form')).not.toBeInTheDocument();
  });

  it('renders the actual downloading phase without an unsupported completion estimate', () => {
    mocks.useStudioClipperProjects.mockReturnValue({
      error: null,
      isLoading: false,
      projects: [],
    });
    mocks.useStudioClipperPage.mockReturnValue(
      baseClipperPageState({
        isHydrating: false,
        editedHighlights: [],
        project: {
          clips: [],
          highlights: [],
          projectId: 'source-1',
          status: 'analyzing',
          source: { flow: 'review', status: 'downloading' },
        },
        step: 'review',
      }),
    );
    render(<ClipperWorkspace projectId="source-1" />);
    expect(screen.getByText('Downloading source media…')).toBeVisible();
    expect(screen.queryByText(/1-2 minutes/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Avatar video generation needs/),
    ).not.toBeInTheDocument();
  });

  it.each([0, 3])(
    'offers source retry from a failed review at attempt %s',
    (retryCount) => {
      mocks.useStudioClipperProjects.mockReturnValue({
        error: null,
        isLoading: false,
        projects: [],
      });
      const handleRetrySource = vi.fn();
      const resetToInput = vi.fn();
      mocks.useStudioClipperPage.mockReturnValue(
        baseClipperPageState({
          editedHighlights: [],
          handleRetrySource,
          isHydrating: false,
          project: {
            clips: [],
            highlights: [],
            projectId: 'source-1',
            status: 'failed',
            source: {
              failure: {
                code: 'clip_source_processing_failed',
                message: 'Audio extraction job 7 failed: Source is unreadable',
                retryable: true,
              },
              flow: 'review',
              maxRetries: 3,
              retryCount,
              status: 'failed',
            },
          },
          resetToInput,
          step: 'review',
        }),
      );
      render(<ClipperWorkspace projectId="source-1" />);

      expect(
        screen.getByText('Audio extraction job 7 failed: Source is unreadable'),
      ).toBeVisible();
      const retry = screen.getByRole('button', {
        name: 'Retry source processing',
      });
      expect(retry).toHaveProperty('disabled', retryCount === 3);
      retry.click();
      expect(handleRetrySource).toHaveBeenCalledTimes(retryCount === 3 ? 0 : 1);
      expect(
        screen.queryByText(
          'Source retry limit reached. No further retries are available.',
        ),
      ).toEqual(retryCount === 3 ? expect.anything() : null);
      screen.getByRole('button', { name: 'Back to projects' }).click();
      expect(resetToInput).toHaveBeenCalledTimes(1);
    },
  );

  it('renders the restored setup form for a draft project', () => {
    mocks.useStudioClipperProjects.mockReturnValue({
      error: null,
      isLoading: false,
      projects: [],
    });
    mocks.useStudioClipperPage.mockReturnValue(
      baseClipperPageState({
        draftSaveState: 'saved',
        isHydrating: false,
        project: {
          clips: [],
          highlights: [],
          mode: 'avatar',
          projectId: 'draft-1',
          name: 'Imported source',
          sourceVideoUrl: 'https://youtu.be/dQw4w9WgXcQ',
          transcriptText: 'Transcript for the imported source.',
          status: 'draft',
        },
        step: 'input',
      }),
    );

    render(<ClipperWorkspace projectId="draft-1" />);

    expect(screen.getByTestId('clipper-source-preview')).toBeVisible();
    expect(
      screen.getByText('Transcript for the imported source.'),
    ).toBeVisible();
    expect(screen.getByTestId('clipper-input-form')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All projects' })).toHaveAttribute(
      'href',
      '/acme/demo/clipper',
    );
  });

  it('pages the project list and drops "Recent" after the first page', () => {
    mocks.searchParams = new URLSearchParams('page=2');
    mocks.useStudioClipperProjects.mockReturnValue({
      error: null,
      isLoading: false,
      projects: [
        {
          failedClipCount: 0,
          id: 'clip-9',
          isDraft: false,
          name: 'Older clip',
          pendingClipCount: 0,
          progress: 100,
          readyClipCount: 1,
          status: 'completed',
        },
      ],
    });

    render(<ClipperWorkspace />);

    expect(
      screen.getByRole('navigation', { name: 'pagination' }),
    ).toBeVisible();
    expect(screen.getByTestId('clipper-project-list')).toHaveAttribute(
      'data-recent-visible',
      'false',
    );
  });

  it('puts the search in the topbar, keeps it on a miss, and searches by the q param', () => {
    mocks.searchParams = new URLSearchParams('page=2');
    mocks.useStudioClipperProjects.mockReturnValue({
      error: null,
      isLoading: false,
      projects: [
        {
          failedClipCount: 0,
          id: 'clip-1',
          isDraft: false,
          name: 'Demo clip',
          pendingClipCount: 0,
          progress: 100,
          readyClipCount: 1,
          status: 'completed',
        },
      ],
    });

    const { rerender } = render(<ClipperWorkspace />);
    const field = screen.getByRole('textbox', { name: 'Search clip projects' });
    expect(screen.getByTestId('section-topbar')).toContainElement(field);

    fireEvent.change(field, { target: { value: 'launch' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    // Searching returns to the first page.
    expect(mocks.replace).toHaveBeenCalledWith(
      '/acme/moonrise/clipper?q=launch',
      { scroll: false },
    );

    mocks.searchParams = new URLSearchParams('q=launch');
    mocks.useStudioClipperProjects.mockReturnValue({
      error: null,
      isLoading: false,
      projects: [],
    });
    rerender(<ClipperWorkspace />);

    expect(
      screen.getByText('No clip projects match your search.'),
    ).toBeVisible();
    expect(
      screen.getByRole('textbox', { name: 'Search clip projects' }),
    ).toHaveValue('launch');
    expect(
      screen.queryByTestId('clipper-project-list'),
    ).not.toBeInTheDocument();
  });
});
