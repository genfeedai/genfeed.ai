import type { BrandRemixRunSummary } from '@genfeedai/contracts/api-types/contracts';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  publishContext: vi.fn(),
  loadMore: vi.fn(),
  searches: [] as string[],
  state: {
    error: null as string | null,
    hasMore: false,
    isLoading: false,
    runs: [] as BrandRemixRunSummary[],
  },
}));

vi.mock('@/features/studio/storyboard/hooks/use-storyboard-runs', () => ({
  useStoryboardRuns: (search: string) => {
    mocks.searches.push(search);
    return { ...mocks.state, loadMore: mocks.loadMore };
  },
}));

vi.mock(
  '@/hooks/agent/use-creative-app-agent-context/use-creative-app-agent-context',
  () => ({ useCreativeAppAgentContext: mocks.publishContext }),
);

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

import StoryboardRunsList from './StoryboardRunsList';

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

describe('StoryboardRunsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searches = [];
    mocks.state = { error: null, hasMore: false, isLoading: false, runs: [] };
  });

  it('lists each run with source kind, state, shots and runtime, linked to the run', () => {
    mocks.state.runs = [summary()];

    render(<StoryboardRunsList />);

    const row = screen.getByTestId('storyboard-run-row');
    expect(within(row).getByText('Proof-led hook')).toBeVisible();
    expect(within(row).getByText('Remix · Discovery')).toBeVisible();
    expect(within(row).getByText('Draft')).toBeVisible();
    expect(within(row).getByText('3 shots')).toBeVisible();
    expect(within(row).getByText('12.5s')).toBeVisible();
    expect(within(row).getByText(/^Edited /)).toBeVisible();
    expect(
      screen.getByRole('link', { name: /Proof-led hook/ }),
    ).toHaveAttribute('href', '/acme/northstar/storyboard/run-1');
  });

  it('tells the agent which runs are on screen once they have loaded', () => {
    mocks.state.runs = [summary()];
    render(<StoryboardRunsList />);

    expect(mocks.publishContext).toHaveBeenLastCalledWith({
      app: 'storyboard',
      projects: [{ id: 'run-1', title: 'Proof-led hook' }],
    });
  });

  it('tells the agent nothing while the runs are still loading', () => {
    mocks.state.isLoading = true;
    render(<StoryboardRunsList />);

    expect(mocks.publishContext).toHaveBeenLastCalledWith(null);
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

    render(<StoryboardRunsList />);

    const needsYou = screen.getByRole('heading', { name: /Needs you/ });
    expect(needsYou).toBeVisible();
    expect(screen.getAllByText('Stalled run')).toHaveLength(2);
    expect(screen.getAllByText('Draft run')).toHaveLength(1);
  });

  it('asks for the searched title and explains a search with no match', async () => {
    const user = userEvent.setup();
    mocks.state.runs = [summary({ id: 'run-1', title: 'Proof-led hook' })];

    const { rerender } = render(<StoryboardRunsList />);
    expect(mocks.searches.at(-1)).toBe('');

    await user.type(
      screen.getByRole('textbox', { name: 'Search storyboards' }),
      'recap{Enter}',
    );
    expect(mocks.searches.at(-1)).toBe('recap');

    mocks.state.runs = [];
    rerender(<StoryboardRunsList />);
    expect(screen.getByText('No storyboards match your search.')).toBeVisible();
  });

  it('omits the runtime when the run has none and hides Needs you when nothing is waiting', () => {
    mocks.state.runs = [summary({ runtimeSeconds: null })];

    render(<StoryboardRunsList />);

    expect(
      within(screen.getByTestId('storyboard-run-row')).queryByText(
        /^\d+(\.\d+)?s$/,
      ),
    ).toBeNull();
    expect(screen.queryByRole('heading', { name: /Needs you/ })).toBeNull();
  });

  it('points an empty list at the prompt on the left, with no presets or hero', () => {
    render(<StoryboardRunsList />);

    expect(screen.getByText('No storyboards yet')).toBeVisible();
    expect(
      screen.getByText('Pitch one on the left and it shows up here.'),
    ).toBeVisible();
    expect(screen.queryByTestId('storyboard-onboarding')).toBeNull();
    expect(screen.queryByTestId('storyboard-preset')).toBeNull();
    expect(screen.queryByRole('link', { name: 'New storyboard' })).toBeNull();
  });

  it('surfaces a load failure with a retry', () => {
    mocks.state.error = 'Network down';

    render(<StoryboardRunsList />);

    expect(screen.getByRole('alert')).toHaveTextContent('Network down');
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
    expect(mocks.loadMore).toHaveBeenCalledTimes(1);
  });
});
