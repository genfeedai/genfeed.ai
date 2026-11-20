import {
  CredentialPlatform,
  SocialWarmupEnrollmentState,
  SocialWarmupSignalSource,
  SocialWarmupSignalStatus,
} from '@genfeedai/contracts';
import { TIKTOK_SOCIAL_WARMUP_BLUEPRINT } from '@genfeedai/contracts/api-types/contracts/social-warmup-blueprint.contract';
import type { ISocialWarmupEnrollment } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SocialWarmupCheckItem from './SocialWarmupCheckItem';
import {
  collectSocialWarmupChecks,
  resolveWarmupCheck,
} from './social-warmup.helpers';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../tests/next-intl.stub'
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

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderCheck(
    id: string,
    enrollment: ISocialWarmupEnrollment,
    props: { focusedCheckId?: string; isPending?: boolean } = {},
  ) {
    const check = resolveWarmupCheck(
      getCheck(id),
      enrollment,
      CredentialPlatform.TIKTOK,
    );
    return render(
      <SocialWarmupCheckItem
        check={check}
        onComplete={onComplete}
        onReopen={onReopen}
        platformLabel="TikTok"
        {...props}
      />,
    );
  }

  it('collapses to the title, the description and one switch', () => {
    renderCheck('use-native-app-manually', createEnrollment());

    expect(
      screen.getByText(getCheck('use-native-app-manually').title),
    ).toBeInTheDocument();
    expect(
      screen.getByText(getCheck('use-native-app-manually').description),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('switch')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /mark complete/i })).toBeNull();
    expect(screen.queryByText(/user_confirmed|you confirmed/i)).toBeNull();
    expect(screen.queryByText(/only you can confirm/i)).toBeNull();
  });

  it('confirms and reopens a manual step from its switch', async () => {
    const { unmount } = renderCheck(
      'use-native-app-manually',
      createEnrollment(),
    );
    const title = getCheck('use-native-app-manually').title;

    await userEvent.click(screen.getByRole('switch', { name: title }));
    expect(onComplete).toHaveBeenCalledWith('use-native-app-manually');
    expect(onReopen).not.toHaveBeenCalled();
    unmount();

    renderCheck(
      'use-native-app-manually',
      createEnrollment({ completedItemIds: ['use-native-app-manually'] }),
    );
    const confirmed = screen.getByRole('switch', { name: title });
    expect(confirmed).toBeChecked();
    await userEvent.click(confirmed);
    expect(onReopen).toHaveBeenCalledWith('use-native-app-manually');
  });

  it('keeps the switch of a step detected on the platform read-only and checked', () => {
    renderCheck(
      'observe-first-upload',
      createEnrollment({
        signals: [
          {
            brandId: 'brand-1',
            createdAt: '2026-08-10T11:00:00.000Z',
            enrollmentId: 'enrollment-1',
            evidence: {},
            id: 'signal-available',
            isDeleted: false,
            key: 'first-upload-platform-signal',
            observedAt: '2026-08-10T11:00:00.000Z',
            organizationId: 'org-1',
            source: SocialWarmupSignalSource.PLATFORM,
            status: SocialWarmupSignalStatus.AVAILABLE,
            updatedAt: '2026-08-10T11:00:00.000Z',
          },
        ],
      }),
    );

    const detected = screen.getByRole('switch', {
      name: getCheck('observe-first-upload').title,
    });
    expect(detected).toBeChecked();
    expect(detected).toBeDisabled();
  });

  it('explains where a platform check comes from and why it is not done once expanded', async () => {
    renderCheck(
      'observe-first-upload',
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
    );

    expect(screen.queryByText(/detected automatically/i)).toBeNull();
    await userEvent.click(
      screen.getByRole('button', {
        name: new RegExp(getCheck('observe-first-upload').title),
      }),
    );

    expect(
      screen.getByText('Detected automatically from TikTok.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/authorized tiktok evidence is stale/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('switch', {
        name: getCheck('observe-first-upload').title,
      }),
    ).not.toBeChecked();
  });

  it('opens by itself when the unresolved-checks list points at it', () => {
    renderCheck('use-native-app-manually', createEnrollment(), {
      focusedCheckId: 'use-native-app-manually',
    });

    expect(
      screen.getByText(
        'Only you can confirm this one. TikTok does not share it with Genfeed.',
      ),
    ).toBeInTheDocument();
  });

  it('says a Genfeed-observed step is tracked from Genfeed posts', async () => {
    renderCheck('observe-genfeed-publish-activity', createEnrollment());
    await userEvent.click(
      screen.getByRole('button', {
        name: new RegExp(getCheck('observe-genfeed-publish-activity').title),
      }),
    );

    expect(
      screen.getByText('Tracked automatically from your Genfeed posts.'),
    ).toBeInTheDocument();
  });

  it('locks the switch while a change is being saved', () => {
    renderCheck('use-native-app-manually', createEnrollment(), {
      isPending: true,
    });

    expect(
      screen.getByRole('switch', {
        name: getCheck('use-native-app-manually').title,
      }),
    ).toBeDisabled();
  });
});
