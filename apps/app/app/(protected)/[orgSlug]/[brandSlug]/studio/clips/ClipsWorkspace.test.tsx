import { PageHelpProvider } from '@genfeedai/contexts/ui/page-help-context';
import { DEFAULT_LOCALE } from '@genfeedai/contracts/constants';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { loadMessages } from '../../../../../../i18n/messages';
import ClipsWorkspace from './ClipsWorkspace';

const mocks = vi.hoisted(() => ({
  useStudioClipProjects: vi.fn(),
  useStudioClipsPage: vi.fn(),
}));

vi.mock('./useStudioClipProjects', () => ({
  useStudioClipProjects: mocks.useStudioClipProjects,
}));

vi.mock('./useStudioClipsPage', () => ({
  useStudioClipsPage: mocks.useStudioClipsPage,
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/demo${path}` }),
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
// stability against the real PageHelpProvider, not the inner forms.
vi.mock('./components/ClipsInputForm', () => ({
  default: () => <div data-testid="clips-input-form" />,
}));

vi.mock('./components/ClipsProjectList', () => ({
  default: () => <div data-testid="clips-project-list" />,
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

// The route-level help content a real page load would resolve for
// `/studio/clips` via `resolvePageHelpKey` + `PAGE_HELP_ROUTES` — sourced
// from the actual English catalog, not a stand-in string, so this test
// fails if that route's help copy is ever removed.
const clipsHelp = loadMessages(DEFAULT_LOCALE).pages.help.studioClips;

function renderWithRealPageHelp() {
  return render(
    <PageHelpProvider help={clipsHelp}>
      <ClipsWorkspace />
    </PageHelpProvider>,
  );
}

describe('ClipsWorkspace with the real page-help provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useStudioClipsPage.mockReturnValue(baseClipsPageState());
  });

  it('does not flip module chrome across loading, empty, and populated states', () => {
    mocks.useStudioClipProjects.mockReturnValue({
      error: null,
      isLoading: true,
      projects: [],
    });

    const { rerender } = renderWithRealPageHelp();
    expect(screen.getByTestId('container')).toHaveAttribute(
      'data-module-chrome',
      'section-topbar',
    );

    mocks.useStudioClipProjects.mockReturnValue({
      error: null,
      isLoading: false,
      projects: [],
    });
    rerender(
      <PageHelpProvider help={clipsHelp}>
        <ClipsWorkspace />
      </PageHelpProvider>,
    );
    expect(screen.getByTestId('container')).toHaveAttribute(
      'data-module-chrome',
      'section-topbar',
    );

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
    rerender(
      <PageHelpProvider help={clipsHelp}>
        <ClipsWorkspace />
      </PageHelpProvider>,
    );
    expect(screen.getByTestId('container')).toHaveAttribute(
      'data-module-chrome',
      'section-topbar',
    );
    expect(screen.getByRole('link', { name: 'New project' })).toHaveAttribute(
      'href',
      '/acme/demo/studio/clips/new',
    );
  });

  it('points an empty project list at the new-project route instead of an unsaved form', () => {
    mocks.useStudioClipProjects.mockReturnValue({
      error: null,
      isLoading: false,
      projects: [],
    });

    renderWithRealPageHelp();

    expect(screen.getByTestId('clips-empty-state')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New project' })).toHaveAttribute(
      'href',
      '/acme/demo/studio/clips/new',
    );
    expect(screen.queryByTestId('clips-input-form')).not.toBeInTheDocument();
  });

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
          status: 'draft',
        },
        step: 'input',
      }),
    );

    render(
      <PageHelpProvider help={clipsHelp}>
        <ClipsWorkspace projectId="draft-1" />
      </PageHelpProvider>,
    );

    expect(screen.getByTestId('clips-input-form')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All projects' })).toHaveAttribute(
      'href',
      '/acme/demo/studio/clips',
    );
  });
});
