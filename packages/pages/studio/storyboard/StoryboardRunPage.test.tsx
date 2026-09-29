import {
  BrandRemixAdPlatform,
  BrandRemixOrganicPlatform,
  type BrandRemixRunView,
} from '@genfeedai/contracts/api-types/contracts';
import type { StoryboardRunRecipe } from '@genfeedai/contracts/interfaces';
import type {
  StoryboardRunPanelProps,
  StoryboardRunRecipeProps,
} from '@genfeedai/props/studio/storyboard.props';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  panelProps: null as StoryboardRunPanelProps | null,
  preparePausedDraft: vi.fn(),
  recipeProps: null as StoryboardRunRecipeProps | null,
  refresh: vi.fn(),
  start: vi.fn(),
  state: {
    error: null as string | null,
    run: null as BrandRemixRunView | null,
    status: 'loading' as string,
  },
  useStoryboardRun: vi.fn(),
}));

vi.mock('@pages/studio/storyboard/hooks/use-storyboard-run', () => ({
  useStoryboardRun: (runId: string) => {
    mocks.useStoryboardRun(runId);
    return {
      ...mocks.state,
      attachSceneSource: vi.fn(),
      cancelScenes: vi.fn(),
      executeScenes: vi.fn(),
      preparePausedDraft: mocks.preparePausedDraft,
      quoteScenes: vi.fn(),
      refresh: mocks.refresh,
      resumeScenes: vi.fn(),
      runId,
      saveScenes: vi.fn(),
      start: mocks.start,
      submitForReview: vi.fn(),
      vary: vi.fn(),
    };
  },
}));

vi.mock('@pages/studio/storyboard/components/StoryboardRunPanel', () => ({
  default: (props: StoryboardRunPanelProps) => {
    mocks.panelProps = props;
    return <section aria-label="Remix run" />;
  },
}));

vi.mock('@pages/studio/storyboard/components/StoryboardRunRecipe', () => ({
  default: (props: StoryboardRunRecipeProps) => {
    mocks.recipeProps = props;
    return <section aria-label="Run recipe" />;
  },
}));

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
  return { useTranslations: translateFromCatalog };
});

import StoryboardRunPage from './StoryboardRunPage';

const run = {
  draft: {
    fidelityMode: 'guided',
    identity: {},
    intent: { objective: 'Original objective' },
    output: { aspectRatio: '9:16', count: 1, kind: 'image' },
    references: [],
    reviewRequired: true,
    target: { kind: 'organic', platform: BrandRemixOrganicPlatform.TIKTOK },
  },
  id: 'run-1',
  revision: 3,
  sourceSnapshot: {
    selector: {
      adAccountId: 'act_1',
      adId: 'ad-1',
      credentialId: 'credential-1',
      kind: 'connected_ad',
      platform: BrandRemixAdPlatform.META,
    },
    title: 'Proof-led hook',
  },
} as BrandRemixRunView;

describe('StoryboardRunPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.panelProps = null;
    mocks.recipeProps = null;
    mocks.state = { error: null, run: null, status: 'loading' };
  });

  it('loads the routed run and links back to the runs list', () => {
    render(<StoryboardRunPage runId="run-1" />);

    expect(mocks.useStoryboardRun).toHaveBeenCalledWith('run-1');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading storyboard run…',
    );
    expect(
      screen.getByRole('link', { name: 'All storyboards' }),
    ).toHaveAttribute('href', '/acme/northstar/studio/storyboard');
  });

  it('keeps a failed load recoverable', () => {
    mocks.state = { error: 'Run not found', run: null, status: 'error' };

    render(<StoryboardRunPage runId="run-1" />);

    expect(screen.getByText('Run not found')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it('starts the run from the saved recipe through the run contract', () => {
    mocks.state = { error: null, run, status: 'ready' };

    render(<StoryboardRunPage runId="run-1" />);

    expect(screen.getAllByText('Proof-led hook').length).toBeGreaterThan(0);
    expect(screen.getByRole('region', { name: 'Remix run' })).toBeVisible();
    const recipe: StoryboardRunRecipe = {
      aspectRatio: '1:1',
      count: 2,
      objective: ' Sharper proof ',
      referenceAssetIds: ['library-1'],
    };
    act(() => mocks.recipeProps?.onGenerate(recipe));

    expect(mocks.start).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: { objective: 'Sharper proof' },
        output: {
          aspectRatio: '1:1',
          count: 2,
          durationSeconds: null,
          kind: 'image',
        },
        references: [{ assetId: 'library-1', role: 'style' }],
      }),
    );
  });

  it('prepares a paused Meta draft for a connected Meta source', () => {
    mocks.state = { error: null, run, status: 'ready' };

    render(<StoryboardRunPage runId="run-1" />);
    act(() => mocks.panelProps?.onPreparePaidDraft?.());

    expect(mocks.preparePausedDraft).toHaveBeenCalledWith({
      destination: { adAccountId: 'act_1', credentialId: 'credential-1' },
    });
  });
});
