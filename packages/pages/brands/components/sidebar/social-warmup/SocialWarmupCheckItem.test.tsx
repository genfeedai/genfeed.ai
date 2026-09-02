import {
  CredentialPlatform,
  SocialWarmupEnrollmentState,
  SocialWarmupSignalSource,
  SocialWarmupSignalStatus,
} from '@genfeedai/contracts';
import { TIKTOK_SOCIAL_WARMUP_BLUEPRINT } from '@genfeedai/contracts/api-types/contracts/social-warmup-blueprint.contract';
import type { ISocialWarmupEnrollment } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SocialWarmupCheckItem from './SocialWarmupCheckItem';
import {
  collectSocialWarmupChecks,
  resolveWarmupCheck,
} from './social-warmup.helpers';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../apps/app/tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

function createEnrollment(
  overrides: Partial<ISocialWarmupEnrollment> = {},
): ISocialWarmupEnrollment {
  return {
    blueprintId: TIKTOK_SOCIAL_WARMUP_BLUEPRINT.id,
    blueprintVersion: TIKTOK_SOCIAL_WARMUP_BLUEPRINT.version,
    brandId: 'brand-1',
    completedItemIds: [],
    createdAt: '2026-08-08T10:00:00.000Z',
    credentialId: 'credential-1',
    currentPhaseId: TIKTOK_SOCIAL_WARMUP_BLUEPRINT.phases[0]?.id ?? 'phase',
    enrolledByUserId: 'user-1',
    events: [],
    hasPartialScopes: false,
    id: 'enrollment-1',
    isCredentialConnected: true,
    isDeleted: false,
    organizationId: 'org-1',
    signals: [],
    startedAt: '2026-08-08T10:00:00.000Z',
    state: SocialWarmupEnrollmentState.IN_PROGRESS,
    updatedAt: '2026-08-08T10:00:00.000Z',
    ...overrides,
  };
}

function getCheck(id: string) {
  const check = collectSocialWarmupChecks(TIKTOK_SOCIAL_WARMUP_BLUEPRINT).find(
    (item) => item.id === id,
  );
  if (!check) {
    throw new Error(`Missing blueprint check ${id}`);
  }
  return check;
}

describe('SocialWarmupCheckItem', () => {
  const onComplete = vi.fn();
  const onReopen = vi.fn();
  const onRefreshSignals = vi.fn();
  const onReconnect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('labels provenance and records user confirmation only from an explicit button', () => {
    const check = resolveWarmupCheck(
      getCheck('use-native-app-manually'),
      createEnrollment(),
      CredentialPlatform.TIKTOK,
    );

    render(
      <SocialWarmupCheckItem
        check={check}
        onComplete={onComplete}
        onReconnect={onReconnect}
        onRefreshSignals={onRefreshSignals}
        onReopen={onReopen}
      />,
    );

    expect(screen.getByText('You confirmed')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Mark complete' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Reopen' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Mark complete' }));
    expect(onComplete).toHaveBeenCalledWith('use-native-app-manually');
  });

  it('lets a confirmed item be reopened', () => {
    const check = resolveWarmupCheck(
      getCheck('use-native-app-manually'),
      createEnrollment({
        completedItemIds: ['use-native-app-manually'],
      }),
      CredentialPlatform.TIKTOK,
    );

    render(
      <SocialWarmupCheckItem
        check={check}
        onComplete={onComplete}
        onReopen={onReopen}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    expect(onReopen).toHaveBeenCalledWith('use-native-app-manually');
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('shows verified-from-platform copy and refresh for stale platform checks', () => {
    const check = resolveWarmupCheck(
      getCheck('observe-first-upload'),
      createEnrollment({
        signals: [
          {
            brandId: 'brand-1',
            createdAt: '2026-08-10T11:00:00.000Z',
            enrollmentId: 'enrollment-1',
            evidence: {},
            id: 'signal-stale',
            isDeleted: false,
            key: 'first-upload-platform-signal',
            observedAt: '2026-08-10T11:00:00.000Z',
            organizationId: 'org-1',
            source: SocialWarmupSignalSource.PLATFORM,
            status: SocialWarmupSignalStatus.STALE,
            updatedAt: '2026-08-10T11:00:00.000Z',
          },
        ],
      }),
      CredentialPlatform.TIKTOK,
    );

    render(
      <SocialWarmupCheckItem
        check={check}
        onComplete={onComplete}
        onRefreshSignals={onRefreshSignals}
        onReopen={onReopen}
      />,
    );

    expect(screen.getByText('Verified from TikTok')).toBeInTheDocument();
    expect(
      screen.getByText(/authorized tiktok evidence is stale/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh signals' }));
    expect(onRefreshSignals).toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: 'Mark complete' }),
    ).not.toBeInTheDocument();
  });

  it('exposes reconnect for disconnected platform checks', () => {
    const check = resolveWarmupCheck(
      getCheck('observe-first-upload'),
      createEnrollment({ isCredentialConnected: false }),
      CredentialPlatform.TIKTOK,
    );

    render(
      <SocialWarmupCheckItem
        check={check}
        onComplete={onComplete}
        onReconnect={onReconnect}
        onReopen={onReopen}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
    expect(onReconnect).toHaveBeenCalled();
  });

  it('labels Genfeed-observed checks without implying private engagement telemetry', () => {
    const check = resolveWarmupCheck(
      getCheck('observe-genfeed-publish-activity'),
      createEnrollment(),
      CredentialPlatform.TIKTOK,
    );

    render(
      <SocialWarmupCheckItem
        check={check}
        onComplete={onComplete}
        onReopen={onReopen}
      />,
    );

    expect(screen.getByText('Observed in Genfeed')).toBeInTheDocument();
    expect(screen.queryByText(/private engagement/i)).not.toBeInTheDocument();
  });
});
