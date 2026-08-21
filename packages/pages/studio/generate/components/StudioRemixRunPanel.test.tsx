import type { BrandRemixRunView } from '@api-types/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import StudioRemixRunPanel from './StudioRemixRunPanel';

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    activeHref: (path: string) => `/org-1/brand-1${path}`,
  }),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../apps/app/tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

const run = {
  brand: { contextMode: 'brand', id: 'brand-1', name: 'Northstar' },
  draft: {
    identity: {},
    output: { aspectRatio: '9:16', count: 2, kind: 'video' },
    references: [
      { assetId: 'reference-1', role: 'product', source: 'brand_default' },
    ],
    target: { kind: 'organic', platform: 'tiktok' },
  },
  execution: {
    actualCount: 1,
    requestedCount: 2,
    variants: [
      {
        assetIds: ['video-1'],
        id: 'variant-1',
        recipeRevision: 2,
        status: 'ready',
      },
      {
        assetIds: [],
        id: 'variant-2',
        recipeRevision: 2,
        status: 'processing',
      },
    ],
  },
  id: 'run-1',
  phase: 'partially_ready',
  readiness: { issues: [], state: 'ready' },
  recipeVersion: 1,
  revision: 2,
  sourceSnapshot: {
    pattern: { hook: 'Proof before promise' },
    title: 'Proof-led TikTok hook',
  },
} as BrandRemixRunView;

describe('StudioRemixRunPanel', () => {
  it('shows durable recipe lineage and groups every variation under the run', () => {
    render(
      <StudioRemixRunPanel
        error={null}
        isWorking={false}
        onReview={vi.fn()}
        onVary={vi.fn()}
        run={run}
      />,
    );

    expect(screen.getByText('Proof-led TikTok hook')).toBeVisible();
    expect(screen.getByText('Proof before promise')).toBeVisible();
    expect(screen.getByText('Recipe v1 · revision 2')).toBeVisible();
    expect(screen.getByText('variant-1')).toBeVisible();
    expect(screen.getByText('variant-2')).toBeVisible();
    expect(screen.getByText('Product · Brand Default')).toBeVisible();
  });

  it('shows the canonical durable identity for an avatar remix', () => {
    render(
      <StudioRemixRunPanel
        error={null}
        isWorking={false}
        onReview={vi.fn()}
        onVary={vi.fn()}
        run={{
          ...run,
          draft: {
            ...run.draft,
            identity: {
              avatarAssetId: 'avatar-row-1',
              speechVoiceId: 'voice-row-1',
            },
            output: {
              aspectRatio: '9:16',
              count: 2,
              kind: 'avatar',
            },
          },
        }}
      />,
    );

    expect(screen.getByText('Avatar · avatar-row-1')).toBeVisible();
    expect(screen.getByText('Voice · voice-row-1')).toBeVisible();
  });

  it('varies the recipe and submits only ready variants for review', () => {
    const onReview = vi.fn();
    const onVary = vi.fn();
    render(
      <StudioRemixRunPanel
        error={null}
        isWorking={false}
        onReview={onReview}
        onVary={onVary}
        run={run}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Vary recipe' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send 1 to Review' }));

    expect(onVary).toHaveBeenCalled();
    expect(onReview).toHaveBeenCalledWith(['variant-1']);
  });

  it('locks review submission once a batch exists and explains the unavailable Meta handoff after approval', () => {
    const paidRun = {
      ...run,
      draft: {
        ...run.draft,
        target: { kind: 'paid' as const, platform: 'meta' as const },
      },
      phase: 'in_review' as const,
      review: {
        approvedPostIds: [],
        batchId: 'batch-1',
        postIds: ['post-1'],
      },
    };
    const { rerender } = render(
      <StudioRemixRunPanel
        error={null}
        isWorking={false}
        onReview={vi.fn()}
        onVary={vi.fn()}
        run={paidRun}
      />,
    );

    expect(
      screen.queryByRole('button', { name: /Send .* to Review/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Meta handoff/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Review' })).toBeVisible();

    rerender(
      <StudioRemixRunPanel
        error={null}
        isWorking={false}
        onReview={vi.fn()}
        onVary={vi.fn()}
        run={{
          ...paidRun,
          phase: 'approved',
          review: { ...paidRun.review, approvedPostIds: ['post-1'] },
        }}
      />,
    );

    expect(
      screen.queryByRole('button', { name: /Meta handoff/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'Meta handoff is waiting for approved creative upload support.',
      ),
    ).toBeVisible();
  });

  it('links an approved organic run to its canonical Publish drafts', () => {
    render(
      <StudioRemixRunPanel
        error={null}
        isWorking={false}
        onReview={vi.fn()}
        onVary={vi.fn()}
        run={{
          ...run,
          phase: 'approved',
          review: {
            approvedPostIds: ['post-1'],
            batchId: 'batch-1',
            postIds: ['post-1'],
          },
        }}
      />,
    );

    expect(
      screen.getByRole('link', { name: 'Open Publish drafts' }),
    ).toHaveAttribute('href', '/org-1/brand-1/publish/scheduled');
    expect(screen.getByRole('link', { name: 'Open Review' })).toBeVisible();
  });
});
