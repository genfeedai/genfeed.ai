import '@testing-library/jest-dom/vitest';
import { ContentLearningMode, MemberRole } from '@genfeedai/contracts';
import type { LearningAccountView } from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HarnessLearningTab from './harness-learning-tab';

const mocks = vi.hoisted(() => ({
  accounts: vi.fn(),
  control: vi.fn(),
  role: 'owner' as string | undefined,
  scope: {
    brandId: 'brand-1',
    organizationId: 'org-1',
    isReady: true,
    pageScope: 'brand',
  },
}));
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});
vi.mock('@hooks/navigation/use-collection-scope/use-collection-scope', () => ({
  useCollectionScope: () => mocks.scope,
}));
vi.mock('@hooks/auth/use-user-role/use-user-role', () => ({
  useUserRole: () => mocks.role,
}));
const getService = async () => ({
  accounts: mocks.accounts,
  control: mocks.control,
});
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => getService,
}));

function account(
  overrides: Partial<LearningAccountView> = {},
): LearningAccountView {
  return {
    id: 'test-account',
    organizationId: 'org-1',
    brandId: 'brand-1',
    credentialId: 'credential-1',
    mode: ContentLearningMode.LIVE,
    revision: 4,
    epoch: 2,
    sharingConsentVersion: null,
    sharedReleasePreference: 'automatic',
    pinnedReleaseId: null,
    approvedArmIds: [],
    baselineCount: 999,
    activePolicyId: 'legacy-policy',
    failureReason: null,
    driftState: null,
    scopes: [],
    ...overrides,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function loaded() {
  await screen.findByText('credential-1');
}
function pause() {
  fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
}

describe('Harness Learning status and safety controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.role = MemberRole.OWNER;
    mocks.scope = {
      brandId: 'brand-1',
      organizationId: 'org-1',
      isReady: true,
      pageScope: 'brand',
    };
    mocks.accounts.mockResolvedValue([account()]);
    mocks.control.mockResolvedValue({ status: 'completed' });
  });
  it('waits for matching ready scope, aborts reads and never fetches an unresolved scope', async () => {
    mocks.scope.isReady = false;
    const view = render(<HarnessLearningTab brandId="brand-1" />);
    expect(mocks.accounts).not.toHaveBeenCalled();
    mocks.scope.isReady = true;
    view.rerender(<HarnessLearningTab brandId="brand-1" />);
    await loaded();
    expect(mocks.accounts).toHaveBeenCalledWith(
      'brand-1',
      expect.any(AbortSignal),
    );
    const signal = mocks.accounts.mock.calls[0][1] as AbortSignal;
    view.unmount();
    expect(signal.aborted).toBe(true);
  });
  it('distinguishes loading, failed fetch with retry, no connected accounts and unavailable scoped evidence', async () => {
    const read = deferred<LearningAccountView[]>();
    mocks.accounts
      .mockReturnValueOnce(read.promise)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([account()]);
    render(<HarnessLearningTab brandId="brand-1" />);
    expect(screen.getByText('Loading learning status…')).toBeInTheDocument();
    await act(async () => read.reject(new Error('PRIVATE_FAILURE')));
    expect(
      await screen.findByText('Learning status could not be loaded.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('PRIVATE_FAILURE')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
    expect(
      await screen.findByText('No connected accounts.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh status' }));
    await loaded();
    expect(
      screen.getByText(
        'Scoped evidence is unavailable; history and eligibility are unknown.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('999')).not.toBeInTheDocument();
    expect(screen.queryByText('legacy-policy')).not.toBeInTheDocument();
  });
  it('keeps accounts and metric masks separate and shows current versions, freshness, exclusions and selected provenance', async () => {
    const descriptor = {
      platform: 'twitter',
      format: 'text' as const,
      objective: 'engagement' as const,
      exposureSource: 'impressions' as const,
      metricWeights: [['likes', 1]] as Array<['likes', number]>,
      retention: false,
      windowId: '48h-v1' as const,
      configVersion: 'rl-reward-v1-experimental' as const,
      featureSchema: 'numeric-nine-v1' as const,
      armCatalogVersion: 'learning-arms-v1' as const,
    };
    const scope = {
      scopeKey: 'mask-likes',
      epoch: 2,
      revision: 3,
      descriptor,
      descriptorHash: 'hash-likes',
      baselineCount: 20,
      activePolicyId: 'policy-1',
      pinnedPolicyId: null,
      lastValidRewardAt: '2026-10-01T00:00:00.000Z',
      unavailableReasons: [],
    };
    mocks.accounts.mockResolvedValue([
      account({
        scopes: [
          scope,
          {
            ...scope,
            scopeKey: 'mask-shares',
            descriptorHash: 'hash-shares',
            descriptor: { ...descriptor, metricWeights: [['shares', 1]] },
            baselineCount: 7,
            lastValidRewardAt: null,
            unavailableReasons: ['missing_metrics'],
          },
        ],
        latestDecision: {
          decisionId: 'selected-1',
          mode: ContentLearningMode.SHADOW,
          configVersion: 'test-config',
          descriptorHash: 'hash-likes',
          policyVersionId: 'selected-policy',
          synthetic: true,
        },
        failureReason: 'reward_failed',
        driftState: 'drifted',
        sharingConsentVersion: 3,
        pinnedReleaseId: 'release-1',
      }),
      account({ id: 'account-2', credentialId: 'credential-2' }),
    ]);
    render(<HarnessLearningTab brandId="brand-1" />);
    await loaded();
    for (const value of [
      'hash-likes',
      'hash-shares',
      'missing_metrics',
      'selected-1',
      'selected-policy',
      'test-config',
      'reward_failed',
      'drifted',
      'release-1',
      'credential-2',
    ])
      expect(screen.getAllByText(value).length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        'This selected strategy does not establish that it was applied to generation.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('likes: 1')).toBeInTheDocument();
    expect(screen.getByText('shares: 1')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('2026-10-01T00:00:00.000Z')).toBeInTheDocument();
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0);
    expect(screen.getByText('Selection is unavailable.')).toBeInTheDocument();
    expect(screen.queryByText('27')).not.toBeInTheDocument();
  });
  it.each([MemberRole.USER, undefined])('keeps %s read-only', async (role) => {
    mocks.role = role;
    render(<HarnessLearningTab brandId="brand-1" />);
    await loaded();
    expect(
      screen.queryByRole('button', { name: 'Pause' }),
    ).not.toBeInTheDocument();
    expect(mocks.control).not.toHaveBeenCalled();
  });
  it.each([MemberRole.OWNER, MemberRole.ADMIN])(
    'allows %s only the three explicit safety actions',
    async (role) => {
      mocks.role = role;
      render(<HarnessLearningTab brandId="brand-1" />);
      await loaded();
      for (const name of ['Pause', 'Shadow', 'Disable'])
        expect(screen.getByRole('button', { name })).toBeEnabled();
      for (const name of ['Live', 'Resume', 'Train', 'Enable sharing'])
        expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    },
  );
  it.each(['shadow', 'disable'] as const)(
    'sends exactly the explicit %s action',
    async (action) => {
      render(<HarnessLearningTab brandId="brand-1" />);
      await loaded();
      fireEvent.click(
        screen.getByRole('button', {
          name: action === 'shadow' ? 'Shadow' : 'Disable',
        }),
      );
      await waitFor(() =>
        expect(mocks.control).toHaveBeenCalledWith(
          'credential-1',
          expect.objectContaining({ action, expectedRevision: 4 }),
        ),
      );
      expect(mocks.control.mock.calls[0][1]).not.toHaveProperty('policyId');
      expect(mocks.control.mock.calls[0][1]).not.toHaveProperty(
        'approvedArmIds',
      );
    },
  );
  it('captures revision and request ID, suppresses duplicate clicks, and refreshes only after completed operation', async () => {
    const write = deferred<{ status: string }>();
    mocks.control.mockReturnValue(write.promise);
    mocks.accounts
      .mockResolvedValueOnce([account()])
      .mockResolvedValueOnce([
        account({ mode: ContentLearningMode.PAUSED, revision: 5 }),
      ]);
    render(<HarnessLearningTab brandId="brand-1" />);
    await loaded();
    pause();
    pause();
    await waitFor(() => expect(mocks.control).toHaveBeenCalledTimes(1));
    expect(mocks.control).toHaveBeenCalledWith(
      'credential-1',
      expect.objectContaining({
        action: 'pause',
        expectedRevision: 4,
        requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        reason: expect.any(String),
      }),
    );
    expect(mocks.accounts).toHaveBeenCalledTimes(1);
    await act(async () => write.resolve({ status: 'completed' }));
    expect(await screen.findByText('paused')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeDisabled();
  });
  it('retries an ambiguous transport failure with the identical immutable intent', async () => {
    mocks.control
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ status: 'completed' });
    render(<HarnessLearningTab brandId="brand-1" />);
    await loaded();
    pause();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Retry same action' }),
    );
    await waitFor(() => expect(mocks.control).toHaveBeenCalledTimes(2));
    expect(mocks.control.mock.calls[1]).toEqual(mocks.control.mock.calls[0]);
  });
  it('discards conflicting intent, reloads and requires a fresh action at the new revision', async () => {
    mocks.control.mockRejectedValueOnce({ response: { status: 409 } });
    mocks.accounts
      .mockResolvedValueOnce([account()])
      .mockResolvedValueOnce([account({ revision: 8 })]);
    render(<HarnessLearningTab brandId="brand-1" />);
    await loaded();
    pause();
    await screen.findByText(
      'Status changed or the action conflicted. Review refreshed status before choosing another action.',
    );
    await waitFor(() => expect(mocks.accounts).toHaveBeenCalledTimes(2));
    expect(
      screen.queryByRole('button', { name: 'Retry same action' }),
    ).not.toBeInTheDocument();
    pause();
    await waitFor(() => expect(mocks.control).toHaveBeenCalledTimes(2));
    expect(mocks.control.mock.calls[1][1].expectedRevision).toBe(8);
    expect(mocks.control.mock.calls[1][1].requestId).not.toBe(
      mocks.control.mock.calls[0][1].requestId,
    );
  });
  it.each([401, 403])(
    'does not claim success or retry writes after HTTP %s',
    async (status) => {
      mocks.control.mockRejectedValue({ response: { status } });
      render(<HarnessLearningTab brandId="brand-1" />);
      await loaded();
      pause();
      expect(
        await screen.findByText(
          'You are not authorized to perform this action.',
        ),
      ).toBeInTheDocument();
      expect(screen.getByText('credential-1')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Retry same action' }),
      ).not.toBeInTheDocument();
    },
  );
  it('offers refresh without reenacting a completed action when status reload fails', async () => {
    mocks.accounts
      .mockResolvedValueOnce([account()])
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([account()]);
    render(<HarnessLearningTab brandId="brand-1" />);
    await loaded();
    pause();
    expect(
      await screen.findByText(
        'The action completed, but status refresh failed. Refresh status before another action.',
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh status' }));
    await loaded();
    expect(mocks.control).toHaveBeenCalledTimes(1);
  });
  it('rejects mismatched account data instead of displaying another brand', async () => {
    mocks.accounts.mockResolvedValue([account({ brandId: 'other-brand' })]);
    render(<HarnessLearningTab brandId="brand-1" />);
    expect(
      await screen.findByText('Learning status could not be loaded.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('credential-1')).not.toBeInTheDocument();
  });
  it.each(['brand', 'organization'])(
    'ignores late reads and mutations after a %s switch',
    async (dimension) => {
      const write = deferred<{ status: string }>();
      const lateRead = deferred<LearningAccountView[]>();
      mocks.control.mockReturnValue(write.promise);
      const view = render(<HarnessLearningTab brandId="brand-1" />);
      await loaded();
      pause();
      await waitFor(() => expect(mocks.control).toHaveBeenCalledTimes(1));
      mocks.accounts
        .mockReturnValueOnce(lateRead.promise)
        .mockResolvedValueOnce([]);
      if (dimension === 'brand') mocks.scope.brandId = 'brand-2';
      else mocks.scope.organizationId = 'org-2';
      view.rerender(<HarnessLearningTab brandId={mocks.scope.brandId} />);
      expect(screen.queryByText('credential-1')).not.toBeInTheDocument();
      await waitFor(() => expect(mocks.accounts).toHaveBeenCalledTimes(2));
      mocks.scope.organizationId = 'org-3';
      view.rerender(<HarnessLearningTab brandId={mocks.scope.brandId} />);
      await screen.findByText('No connected accounts.');
      await act(async () => {
        lateRead.resolve([account()]);
        write.resolve({ status: 'completed' });
      });
      expect(screen.queryByText('credential-1')).not.toBeInTheDocument();
      expect(mocks.accounts).toHaveBeenCalledTimes(3);
      expect(
        within(screen.getByRole('region', { name: 'Learning' })).queryByText(
          'Action completed.',
        ),
      ).not.toBeInTheDocument();
    },
  );
});
