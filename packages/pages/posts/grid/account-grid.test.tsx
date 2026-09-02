import { CredentialPlatform, TargetExecutionState } from '@genfeedai/contracts';
import type { IReleaseGroup } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AccountGrid from './account-grid';
import '@testing-library/jest-dom/vitest';

const getToken = vi.fn(async () => 'token-123');
const listBrandAccountHealth = vi.fn();
const listPostingTimes = vi.fn();

vi.mock('@helpers/auth/auth.helper', () => ({
  resolveAuthToken: vi.fn(async (getTokenFn: () => Promise<string>) =>
    getTokenFn(),
  ),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ getToken }),
}));

vi.mock('@services/organization/credentials.service', () => ({
  CredentialsService: {
    getInstance: () => ({ listBrandAccountHealth, listPostingTimes }),
  },
}));

vi.mock('@ui/previews/TargetPreview', () => ({
  default: ({ release }: { release: IReleaseGroup }) => (
    <div>{release.title} preview</div>
  ),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../apps/app/tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

function buildAccount(overrides: Record<string, unknown> = {}) {
  return {
    credentialId: 'credential-x',
    handle: '@desk',
    holdPublishing: false,
    label: 'Desk X',
    override: { isActive: false },
    platform: CredentialPlatform.TWITTER,
    reconnect: undefined,
    riskLevel: 'low',
    score: 80,
    signals: {
      connectedDays: 10,
      profileSignals: 1,
      publishedPosts: 4,
      recentFailures: 0,
    },
    state: 'healthy',
    thresholds: {
      maxRecentFailures: 3,
      minConnectedDays: 7,
      minProfileSignals: 1,
      minPublishedPosts: 1,
    },
    ...overrides,
  };
}

function buildRelease(): IReleaseGroup {
  return {
    id: 'release-1',
    scheduledAt: '2026-09-03T10:00:00.000Z',
    targets: [
      {
        credentialId: 'credential-x',
        executionState: TargetExecutionState.SCHEDULED,
        id: 'target-1',
        platform: CredentialPlatform.TWITTER,
      },
    ],
    title: 'Morning briefing',
  } as IReleaseGroup;
}

describe('AccountGrid', () => {
  beforeEach(() => {
    listBrandAccountHealth.mockReset();
    listPostingTimes.mockReset();
    listPostingTimes.mockResolvedValue([]);
    getToken.mockClear();
  });

  it('renders one lane per connected account and opens the release on tile click', async () => {
    listBrandAccountHealth.mockResolvedValue([buildAccount()]);
    const onSelectRelease = vi.fn();

    render(
      <AccountGrid
        brandId="brand-1"
        browserTimezone="UTC"
        isLoading={false}
        onSelectRelease={onSelectRelease}
        reconnectHref="/settings/social"
        releases={[buildRelease()]}
        selectedCredentialIds={[]}
      />,
    );

    expect(await screen.findByLabelText('@desk')).toBeVisible();
    expect(screen.getByText('Morning briefing preview')).toBeVisible();

    screen.getByRole('button', { name: 'Morning briefing' }).click();
    expect(onSelectRelease).toHaveBeenCalledWith('release-1');
  });

  it('shows the reconnect banner when the account token is expired', async () => {
    listBrandAccountHealth.mockResolvedValue([
      buildAccount({
        reconnect: {
          credentialId: 'credential-x',
          isAvailable: true,
          reason: 'disconnected',
        },
      }),
    ]);

    render(
      <AccountGrid
        brandId="brand-1"
        browserTimezone="UTC"
        isLoading={false}
        onSelectRelease={vi.fn()}
        reconnectHref="/settings/social"
        releases={[]}
        selectedCredentialIds={[]}
      />,
    );

    expect(await screen.findByText(/Token expired|Reconnect/i)).toBeVisible();
    expect(screen.getByRole('link', { name: /Reconnect/i })).toHaveAttribute(
      'href',
      '/settings/social',
    );
  });

  it('renders a gap tile for an empty preferred slot', async () => {
    listBrandAccountHealth.mockResolvedValue([
      buildAccount({
        credentialId: 'credential-ig',
        handle: '@studio',
        platform: CredentialPlatform.INSTAGRAM,
      }),
    ]);
    listPostingTimes.mockResolvedValue([{ hour: 18, minute: 0 }]);

    render(
      <AccountGrid
        brandId="brand-1"
        browserTimezone="UTC"
        isLoading={false}
        onSelectRelease={vi.fn()}
        reconnectHref="/settings/social"
        releases={[]}
        selectedCredentialIds={[]}
      />,
    );

    expect(await screen.findByTestId('account-grid-gap')).toBeVisible();
  });
});
