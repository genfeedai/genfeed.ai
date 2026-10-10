import type {
  BreakoutResponsePage,
  BreakoutResponseView,
} from '@genfeedai/contracts/interfaces';
import type { ContainerProps } from '@genfeedai/props/ui/ui.props';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BreakoutsContent from './content';
import BreakoutResponseDetail from './response-detail';

const mocks = vi.hoisted(() => ({
  strategyId: null as string | null,
  scope: {
    brandId: 'brand-a',
    organizationId: 'org-a',
    isReady: true,
    pageScope: 'brand',
  },
  identity: { userId: 'user-a', sessionId: 'session-a', orgId: 'org-a' },
  getService: vi.fn(),
  list: vi.fn(),
  detail: vi.fn(),
}));
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog, useLocale: () => 'en' };
});
vi.mock('next/navigation', () => ({
  useSearchParams: () =>
    new URLSearchParams(
      mocks.strategyId ? { strategyId: mocks.strategyId } : {},
    ),
}));
vi.mock('@hooks/navigation/use-collection-scope/use-collection-scope', () => ({
  useCollectionScope: () => mocks.scope,
}));
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => mocks.identity,
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/org-a/brand-a${path}` }),
}));
vi.mock('@ui/layout/container/Container', () => ({
  default: ({ children }: ContainerProps) => <div>{children}</div>,
}));

function response(
  brandId = 'brand-a',
  id = 'response-a',
): BreakoutResponseView {
  return {
    id,
    brandId,
    organizationId: 'org-a',
    credentialId: 'credential',
    platform: 'twitter',
    state: 'detected',
    detectedAt: '2026-10-09T10:00:00Z',
    createdAt: '2026-10-09T10:00:00Z',
    updatedAt: '2026-10-09T10:00:00Z',
    isDeleted: false,
    source: {
      kind: 'native_source_post',
      id: 'native',
      externalId: `original-${brandId}`,
      logicalPostId: 'logical',
      format: 'text',
      publishedAt: '2026-10-09T09:00:00Z',
      status: 'current',
    },
    trigger: {
      receiptId: 'receipt',
      metric: 'impressions',
      evaluatedAt: '2026-10-09T10:00:00Z',
      ratio: 10,
      median: 10,
      sampleSize: 5,
      targetValue: 100,
      metricSource: 'organic',
      exposureScope: 'organic',
      timeBasis: 'collection_interval',
    },
    outputs: null,
    outputRegistryStatus: 'not_loaded',
    capacity: null,
    readAt: '2026-10-09T10:01:00Z',
  };
}
function page(docs: BreakoutResponseView[]): BreakoutResponsePage {
  return {
    docs,
    limit: 20,
    page: 1,
    pages: docs.length === 0 ? 0 : 1,
    total: docs.length,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.strategyId = null;
  mocks.scope = {
    brandId: 'brand-a',
    organizationId: 'org-a',
    isReady: true,
    pageScope: 'brand',
  };
  mocks.identity = { userId: 'user-a', sessionId: 'session-a', orgId: 'org-a' };
  mocks.getService.mockResolvedValue({
    list: mocks.list,
    detail: mocks.detail,
  });
  mocks.list.mockResolvedValue(page([response()]));
  mocks.detail.mockResolvedValue({
    ...response(),
    outputs: [],
    outputRegistryStatus: 'current',
  });
});
afterEach(cleanup);

describe('brand-scoped Breakouts read page', () => {
  it('loads evidence, inspects an empty plan and refreshes with abortable GET calls', async () => {
    const user = userEvent.setup();
    render(<BreakoutsContent />);
    expect(screen.getByText('Loading breakout responses…')).toBeInTheDocument();
    expect(
      await screen.findByText('10× the comparable median'),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Inspect breakout original-brand-a' }),
    );
    expect(
      await screen.findByText('No follow-up outputs have been reserved.'),
    ).toBeInTheDocument();
    expect(mocks.detail).toHaveBeenCalledWith(
      'brand-a',
      'response-a',
      {},
      expect.any(AbortSignal),
    );
    await user.click(
      screen.getByRole('button', { name: 'Refresh breakout responses' }),
    );
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
  });

  it('clears rendered list and detail immediately when the selected brand changes', async () => {
    const user = userEvent.setup();
    const view = render(<BreakoutsContent />);
    await screen.findByText('Original post: original-brand-a');
    await user.click(
      screen.getByRole('button', { name: 'Inspect breakout original-brand-a' }),
    );
    await screen.findByText('Response details');
    const oldSignal = mocks.list.mock.calls[0]?.[2] as AbortSignal;
    mocks.scope = { ...mocks.scope, brandId: 'brand-b' };
    mocks.list.mockReturnValue(new Promise<BreakoutResponsePage>(() => {}));
    view.rerender(<BreakoutsContent />);
    expect(oldSignal.aborted).toBe(true);
    expect(
      screen.queryByText('Original post: original-brand-a'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Response details')).not.toBeInTheDocument();
    expect(screen.getByText('Loading breakout responses…')).toBeInTheDocument();
  });

  it('ignores a previous organization response that resolves after switching', async () => {
    let resolveOld: ((value: BreakoutResponsePage) => void) | undefined;
    mocks.list.mockImplementationOnce(
      () =>
        new Promise<BreakoutResponsePage>((resolve) => {
          resolveOld = resolve;
        }),
    );
    const view = render(<BreakoutsContent />);
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(1));
    mocks.scope = {
      ...mocks.scope,
      brandId: 'brand-b',
      organizationId: 'org-b',
    };
    mocks.identity = { ...mocks.identity, orgId: 'org-b' };
    mocks.list.mockResolvedValue(
      page([{ ...response('brand-b', 'response-b'), organizationId: 'org-b' }]),
    );
    view.rerender(<BreakoutsContent />);
    await screen.findByText('Original post: original-brand-b');
    await act(async () => {
      resolveOld?.(page([response()]));
    });
    expect(
      screen.queryByText('Original post: original-brand-a'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Original post: original-brand-b'),
    ).toBeInTheDocument();
  });

  it('clears old data on session replacement even when the brand is unchanged', async () => {
    const view = render(<BreakoutsContent />);
    await screen.findByText('Original post: original-brand-a');
    mocks.identity = {
      ...mocks.identity,
      sessionId: 'session-b',
      userId: 'user-b',
    };
    mocks.list.mockReturnValue(new Promise<BreakoutResponsePage>(() => {}));
    view.rerender(<BreakoutsContent />);
    expect(
      screen.queryByText('Original post: original-brand-a'),
    ).not.toBeInTheDocument();
  });

  it('ignores a detail response that arrives after the brand changes', async () => {
    const user = userEvent.setup();
    let resolveDetail: ((value: BreakoutResponseView) => void) | undefined;
    mocks.detail.mockImplementationOnce(
      () =>
        new Promise<BreakoutResponseView>((resolve) => {
          resolveDetail = resolve;
        }),
    );
    const view = render(<BreakoutsContent />);
    await screen.findByText('Original post: original-brand-a');
    await user.click(
      screen.getByRole('button', { name: 'Inspect breakout original-brand-a' }),
    );
    await waitFor(() => expect(mocks.detail).toHaveBeenCalledTimes(1));
    const signal = mocks.detail.mock.calls[0]?.[3] as AbortSignal;
    mocks.scope = { ...mocks.scope, brandId: 'brand-b' };
    mocks.list.mockResolvedValue(page([response('brand-b', 'response-b')]));
    view.rerender(<BreakoutsContent />);
    await screen.findByText('Original post: original-brand-b');
    await act(async () => {
      resolveDetail?.({
        ...response(),
        outputs: [],
        outputRegistryStatus: 'current',
      });
    });
    expect(signal.aborted).toBe(true);
    expect(screen.queryByText('Response details')).not.toBeInTheDocument();
  });

  it('paginates a bounded list and resets inspection when changing pages', async () => {
    const user = userEvent.setup();
    mocks.list.mockResolvedValueOnce({
      ...page([response()]),
      pages: 2,
      total: 21,
    });
    mocks.list.mockResolvedValueOnce({
      ...page([response('brand-a', 'response-next')]),
      page: 2,
      pages: 2,
      total: 21,
    });
    render(<BreakoutsContent />);
    await screen.findByText('Page 1 of 2 · 21 responses');
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await user.click(
      screen.getByRole('button', { name: 'Inspect breakout original-brand-a' }),
    );
    await screen.findByText('Response details');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('Page 2 of 2 · 21 responses');
    expect(mocks.list).toHaveBeenLastCalledWith(
      'brand-a',
      { limit: 20, page: 2 },
      expect.any(AbortSignal),
    );
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.queryByText('Response details')).not.toBeInTheDocument();
  });

  it('requests advisory capacity only for an explicitly selected strategy', async () => {
    mocks.strategyId = 'selected-strategy';
    mocks.detail.mockResolvedValue({
      ...response(),
      outputs: [],
      outputRegistryStatus: 'current',
      capacity: { status: 'held', reason: 'wallet_unavailable' },
    });
    const user = userEvent.setup();
    render(<BreakoutsContent />);
    await screen.findByText('Original post: original-brand-a');
    await user.click(
      screen.getByRole('button', { name: 'Inspect breakout original-brand-a' }),
    );
    expect(
      await screen.findByText(
        'Capacity is held. The current credit balance is unavailable.',
      ),
    ).toBeInTheDocument();
    expect(mocks.detail).toHaveBeenCalledWith(
      'brand-a',
      'response-a',
      { strategyId: 'selected-strategy' },
      expect.any(AbortSignal),
    );
  });

  it('keeps a detail access error distinct from an empty plan', async () => {
    const user = userEvent.setup();
    mocks.detail.mockRejectedValue(new Error('Forbidden'));
    render(<BreakoutsContent />);
    await screen.findByText('Original post: original-brand-a');
    await user.click(
      screen.getByRole('button', { name: 'Inspect breakout original-brand-a' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to load this response',
    );
    expect(
      screen.queryByText('No follow-up outputs have been reserved.'),
    ).not.toBeInTheDocument();
  });

  it('shows an access/read error rather than a false empty result', async () => {
    mocks.list.mockRejectedValue(new Error('Forbidden'));
    render(<BreakoutsContent />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to load breakout responses',
    );
    expect(
      screen.queryByText(
        'No breakout responses have been detected for this brand.',
      ),
    ).not.toBeInTheDocument();
  });

  it('holds unexpected foreign results without displaying their evidence', async () => {
    mocks.list.mockResolvedValue(page([response('foreign-brand')]));
    render(<BreakoutsContent />);
    await screen.findByRole('alert');
    expect(
      screen.queryByText('Original post: original-foreign-brand'),
    ).not.toBeInTheDocument();
  });

  it('does not fetch without a ready selected brand', () => {
    mocks.scope = { ...mocks.scope, pageScope: 'org' };
    render(<BreakoutsContent />);
    expect(
      screen.getByText('Select a brand to inspect its breakout responses.'),
    ).toBeInTheDocument();
    expect(mocks.getService).not.toHaveBeenCalled();
  });
});

describe('response detail semantics', () => {
  it.each(['organic', 'paid', 'aggregate', 'unknown', null] as const)(
    'displays %s provenance explicitly',
    (scope) => {
      const item = response();
      if (!item.trigger) throw new Error('Fixture trigger required');
      item.trigger.exposureScope = scope;
      render(<BreakoutResponseDetail response={item} />);
      expect(
        screen.getByText(
          `Exposure provenance: ${scope ?? 'Not retained in this legacy receipt'}`,
        ),
      ).toBeInTheDocument();
    },
  );
  it('keeps observed zero distinct from unavailable metrics and quota', () => {
    const item = response();
    if (!item.trigger) throw new Error('Fixture trigger required');
    item.trigger.targetValue = 0;
    item.trigger.median = null;
    item.capacity = {
      status: 'available',
      capturedAt: item.readAt,
      strategyId: 'strategy',
      walletVersion: 1,
      capUsageBasis: 'configured_cap_usage_unavailable',
      cadenceTruncated: false,
      remainingPublicationSlots: 0,
      budget: {
        availableOrganizationCredits: 0,
        remainingDailyCredits: null,
        remainingWeeklyCredits: null,
        remainingMonthlyCredits: null,
        remainingPlatformCredits: null,
        remainingPacingCredits: null,
        remainingFormatCredits: {},
      },
    };
    render(<BreakoutResponseDetail response={item} />);
    expect(
      screen.getByText('impressions: 0 · Median: Unavailable · Prior posts: 5'),
    ).toBeInTheDocument();
    expect(screen.getByText('Remaining posting slots: 0')).toBeInTheDocument();
    expect(
      screen.getByText('Available organization credits: 0'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Detailed output status has not been loaded.'),
    ).toBeInTheDocument();
  });

  it('distinguishes scheduled work, uncertain generation and confirmed publication', () => {
    const item = response();
    item.outputRegistryStatus = 'current';
    item.outputs = [
      {
        id: 'scheduled',
        ordinal: 1,
        kind: 'follow_up',
        format: 'text',
        recovery: {
          status: 'available',
          responseId: item.id,
          outputId: 'scheduled',
          state: 'scheduled',
          reason: 'publication_confirmation_missing',
          action: 'wait',
          mayRepeatPaidRequest: false,
          postId: 'draft',
          externalId: null,
        },
      },
      {
        id: 'uncertain',
        ordinal: 2,
        kind: 'follow_up',
        format: 'video',
        recovery: {
          status: 'available',
          responseId: item.id,
          outputId: 'uncertain',
          state: 'reconciliation_required',
          reason: 'generation_outcome_indeterminate',
          action: 'reconcile',
          mayRepeatPaidRequest: false,
          postId: null,
          externalId: null,
        },
      },
      {
        id: 'published',
        ordinal: 3,
        kind: 'quote',
        format: 'text',
        recovery: {
          status: 'available',
          responseId: item.id,
          outputId: 'published',
          state: 'published',
          reason: 'confirmed_publication',
          action: 'none',
          mayRepeatPaidRequest: false,
          postId: 'published-post',
          externalId: 'external-publication',
        },
      },
    ];
    render(<BreakoutResponseDetail response={item} />);
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.getByText('Needs reconciliation')).toBeInTheDocument();
    expect(screen.getAllByText('Published')).toHaveLength(1);
    expect(
      screen.getByText('Published post: external-publication'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open follow-up post 1' }),
    ).toHaveAttribute('href', '/org-a/brand-a/publishing/posts/draft');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows held source and registry conflicts instead of a false empty plan', () => {
    const item = {
      ...response(),
      outputs: [],
      outputRegistryStatus: 'conflict' as const,
    };
    item.source.status = 'changed_or_unavailable';
    render(<BreakoutResponseDetail response={item} />);
    expect(screen.getByText(/Response execution is held/)).toBeInTheDocument();
    expect(
      screen.getByText(/Response status needs reconciliation/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('No follow-up outputs have been reserved.'),
    ).not.toBeInTheDocument();
  });
});
