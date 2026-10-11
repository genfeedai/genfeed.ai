import type { BrandRemixRunSummary } from '@genfeedai/contracts/api-types/contracts';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  brandId: 'brand-1' as string | null,
  create: vi.fn<(input: unknown) => Promise<string>>(),
  createError: null as string | null,
  loadMore: vi.fn(),
  push: vi.fn(),
  state: {
    error: null as string | null,
    hasMore: false,
    isLoading: false,
    runs: [] as BrandRemixRunSummary[],
  },
}));

vi.mock('@pages/studio/storyboard/hooks/use-storyboard-runs', () => ({
  useStoryboardRuns: () => ({ ...mocks.state, loadMore: mocks.loadMore }),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrandId: () => mocks.brandId,
}));

vi.mock('@pages/studio/storyboard/hooks/use-create-storyboard', () => ({
  useCreateStoryboard: () => ({
    create: mocks.create,
    error: mocks.createError,
    isCreating: false,
    isCurrentResult: () => true,
  }),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/northstar${path}` }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useLocale: () => 'en-US', useTranslations: translateFromCatalog };
});

import StoryboardRunsPage from './StoryboardRunsPage';

function summary(
  overrides: Partial<BrandRemixRunSummary> = {},
): BrandRemixRunSummary {
  return {
    brandId: 'brand-1',
    createdAt: '2026-09-01T10:00:00.000Z',
    id: 'run-1',
    outputKind: 'video',
    phase: 'prefilled',
    runtimeSeconds: 12.5,
    shotCount: 3,
    sourceKind: 'remix_discovery',
    title: 'Proof-led hook',
    updatedAt: '2026-09-02T10:00:00.000Z',
    ...overrides,
  };
}

describe('StoryboardRunsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.brandId = 'brand-1';
    mocks.createError = null;
    mocks.state = { error: null, hasMore: false, isLoading: false, runs: [] };
  });

  it('lists each run with source kind, state, shots, runtime and an Open link', () => {
    mocks.state.runs = [summary()];

    render(<StoryboardRunsPage />);

    const row = screen.getByTestId('storyboard-run-row');
    expect(within(row).getByText('Proof-led hook')).toBeVisible();
    expect(within(row).getByText('Remix · Discovery')).toBeVisible();
    expect(within(row).getByText('Draft')).toBeVisible();
    expect(within(row).getByText('3 shots')).toBeVisible();
    expect(within(row).getByText('12.5s')).toBeVisible();
    expect(within(row).getByText(/^Edited /)).toBeVisible();
    expect(
      within(row).getByRole('link', { name: 'Open Proof-led hook' }),
    ).toHaveAttribute('href', '/acme/northstar/studio/storyboard/run-1');
  });

  it('raises runs that need the creator above the full list', () => {
    mocks.state.runs = [
      summary({ id: 'run-ok', title: 'Draft run' }),
      summary({
        id: 'run-failed',
        scenePipelineState: 'partial_failure',
        title: 'Stalled run',
      }),
    ];

    render(<StoryboardRunsPage />);

    const needsYou = screen.getByRole('heading', { name: /Needs you/ });
    expect(needsYou).toBeVisible();
    expect(screen.getAllByText('Stalled run')).toHaveLength(2);
    expect(screen.getAllByText('Draft run')).toHaveLength(1);
  });

  it('omits the runtime when the run has none and hides Needs you when nothing is waiting', () => {
    mocks.state.runs = [summary({ runtimeSeconds: null })];

    render(<StoryboardRunsPage />);

    expect(
      within(screen.getByTestId('storyboard-run-row')).queryByText(
        /^\d+(\.\d+)?s$/,
      ),
    ).toBeNull();
    expect(screen.queryByRole('heading', { name: /Needs you/ })).toBeNull();
  });

  it('shows the onboarding with presets and the create entry points', () => {
    render(<StoryboardRunsPage />);

    expect(screen.getByTestId('storyboard-onboarding')).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Turn an idea into a storyboard' }),
    ).toBeVisible();
    expect(screen.getAllByTestId('storyboard-preset')).toHaveLength(8);
    for (const link of screen.getAllByRole('link', {
      name: /New storyboard|Choose a video/,
    }))
      expect(link).toHaveAttribute(
        'href',
        '/acme/northstar/studio/storyboard/new',
      );
  });

  it('creates a storyboard from a preset in one click and opens it', async () => {
    mocks.create.mockResolvedValue('run-new');

    render(<StoryboardRunsPage />);

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Create a storyboard from Product launch teaser',
      }),
    );

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(
        '/acme/northstar/studio/storyboard/run-new',
      ),
    );
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        planSettings: {
          cast: [],
          format: '9:16',
          runtimeBudgetSeconds: 15,
          styleReferenceAssetIds: [],
          videoModelKey: null,
        },
        source: expect.objectContaining({ kind: 'brief' }),
      }),
    );
  });

  it('disables presets until a brand is selected', () => {
    mocks.brandId = null;

    render(<StoryboardRunsPage />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Choose a brand to start a storyboard from a preset.',
    );
    expect(
      screen.getByRole('button', {
        name: 'Create a storyboard from Product launch teaser',
      }),
    ).toBeDisabled();
  });

  it('keeps presets discoverable above existing runs as one row', () => {
    mocks.state.runs = [summary()];

    render(<StoryboardRunsPage />);

    expect(screen.queryByTestId('storyboard-onboarding')).toBeNull();
    expect(screen.getAllByTestId('storyboard-preset')).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'See all presets' }));
    expect(screen.getAllByTestId('storyboard-preset')).toHaveLength(8);
  });

  it('surfaces a load failure with a retry', () => {
    mocks.state.error = 'Network down';

    render(<StoryboardRunsPage />);

    expect(screen.getByRole('alert')).toHaveTextContent('Network down');
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
    expect(mocks.loadMore).toHaveBeenCalledTimes(1);
  });
});
