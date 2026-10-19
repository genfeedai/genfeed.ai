import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import ClipsWorkspace from './ClipsWorkspace';

const mocks = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
  useStudioClipProjects: vi.fn(),
  useStudioClipsPage: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => mocks.searchParams,
}));

vi.mock('@ui/navigation/pagination/auto-pagination/AutoPagination', () => ({
  default: () => <nav aria-label="pagination" />,
}));

vi.mock('./useStudioClipProjects', () => ({
  useStudioClipProjects: mocks.useStudioClipProjects,
}));

vi.mock('./useStudioClipsPage', () => ({
  useStudioClipsPage: mocks.useStudioClipsPage,
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
vi.mock('./components/ClipsInputForm', () => ({
  default: () => <div data-testid="clips-input-form" />,
}));

vi.mock('./components/ClipsProjectList', () => ({
  default: ({ isRecentVisible }: { isRecentVisible?: boolean }) => (
    <div
      data-recent-visible={String(isRecentVisible)}
      data-testid="clips-project-list"
    />
  ),
}));

function baseClipsPageState(overrides: Record<string, unknown> = {}) {
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

describe('ClipsWorkspace chrome stability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParams = new URLSearchParams();
    mocks.useStudioClipsPage.mockReturnValue(baseClipsPageState());
  });

  it('shows no topbar until there is an action, then puts New project in it', () => {
    mocks.useStudioClipProjects.mockReturnValue({
      error: null,
      isLoading: false,
      projects: [],
    });

    const { rerender } = render(<ClipsWorkspace />);
    expect(screen.queryByTestId('section-topbar')).not.toBeInTheDocument();

    mocks.useStudioClipProjects.mockReturnValue({
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
    rerender(<ClipsWorkspace />);
    expect(screen.getByTestId('section-topbar')).toContainElement(
      screen.getByRole('link', { name: 'New project' }),
    );
  });

  it('points an empty project list at the new-project route instead of an unsaved form', () => {
    mocks.useStudioClipProjects.mockReturnValue({
      error: null,
      isLoading: false,
      projects: [],
    });

    render(<ClipsWorkspace />);

    expect(screen.getByTestId('clips-empty-state')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New project' })).toHaveAttribute(
      'href',
      '/acme/demo/studio/clips/new',
    );
    expect(screen.queryByTestId('clips-input-form')).not.toBeInTheDocument();
  });

  it('renders the actual downloading phase without an unsupported completion estimate', () => {
    mocks.useStudioClipProjects.mockReturnValue({
      error: null,
      isLoading: false,
      projects: [],
    });
    mocks.useStudioClipsPage.mockReturnValue(
      baseClipsPageState({
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
    render(<ClipsWorkspace projectId="source-1" />);
    expect(screen.getByText('Downloading source media…')).toBeVisible();
    expect(screen.queryByText(/1-2 minutes/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Avatar video generation needs/),
    ).not.toBeInTheDocument();
  });

  it.each([0, 3])(
    'offers source retry from a failed review at attempt %s',
    (retryCount) => {
      mocks.useStudioClipProjects.mockReturnValue({
        error: null,
        isLoading: false,
        projects: [],
      });
      const handleRetrySource = vi.fn();
      const resetToInput = vi.fn();
      mocks.useStudioClipsPage.mockReturnValue(
        baseClipsPageState({
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
      render(<ClipsWorkspace projectId="source-1" />);

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
    mocks.useStudioClipProjects.mockReturnValue({
      error: null,
      isLoading: false,
      projects: [],
    });
    mocks.useStudioClipsPage.mockReturnValue(
      baseClipsPageState({
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

    render(<ClipsWorkspace projectId="draft-1" />);

    expect(screen.getByTestId('clips-source-preview')).toBeVisible();
    expect(
      screen.getByText('Transcript for the imported source.'),
    ).toBeVisible();
    expect(screen.getByTestId('clips-input-form')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All projects' })).toHaveAttribute(
      'href',
      '/acme/demo/studio/clips',
    );
  });

  it('pages the project list and drops "Recent" after the first page', () => {
    mocks.searchParams = new URLSearchParams('page=2');
    mocks.useStudioClipProjects.mockReturnValue({
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

    render(<ClipsWorkspace />);

    expect(
      screen.getByRole('navigation', { name: 'pagination' }),
    ).toBeVisible();
    expect(screen.getByTestId('clips-project-list')).toHaveAttribute(
      'data-recent-visible',
      'false',
    );
  });
});
