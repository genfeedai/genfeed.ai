import {
  CredentialPlatform,
  SocialWarmupEnrollmentState,
  SocialWarmupSignalSource,
  SocialWarmupSignalStatus,
} from '@genfeedai/contracts';
import {
  LINKEDIN_SOCIAL_WARMUP_BLUEPRINT_ID,
  TIKTOK_SOCIAL_WARMUP_BLUEPRINT_ID,
  YOUTUBE_SOCIAL_WARMUP_BLUEPRINT_ID,
} from '@genfeedai/contracts/api-types/contracts/social-warmup-blueprint.contract';
import type {
  AccountHealthSummary,
  ISocialWarmupEnrollment,
} from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { resolveOAuthServicePath } from '@ui/constants/oauth-connect-platforms';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SocialWarmupProgram from './SocialWarmupProgram';

const completeItem = vi.fn();
const enroll = vi.fn();
const reopenItem = vi.fn();
const refresh = vi.fn();
const refreshAuthorizedSignals = vi.fn();
const resolveAuthToken = vi.fn(async () => 'token-123');
const servicesPlatform = vi.fn();

let hookState: {
  completeItem: typeof completeItem;
  data: ISocialWarmupEnrollment | null;
  enroll: typeof enroll;
  error: unknown;
  isLoading: boolean;
  refresh: typeof refresh;
  reopenItem: typeof reopenItem;
};

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../apps/app/tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

vi.mock(
  '@hooks/data/social/use-social-warmup-enrollment/use-social-warmup-enrollment',
  () => ({
    useSocialWarmupEnrollment: () => hookState,
  }),
);

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({
    getToken: vi.fn(async () => 'token-123'),
  }),
}));

vi.mock('@helpers/auth/auth.helper', () => ({
  resolveAuthToken: (...args: unknown[]) => resolveAuthToken(...args),
}));

vi.mock('@services/external/services.service', () => ({
  ServicesService: class {
    constructor(platform: string) {
      servicesPlatform(platform);
    }

    refreshAuthorizedSignals = refreshAuthorizedSignals;
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: vi.fn(),
      success: vi.fn(),
    }),
  },
}));

function createEnrollment(
  overrides: Partial<ISocialWarmupEnrollment> = {},
): ISocialWarmupEnrollment {
  return {
    blueprintId: TIKTOK_SOCIAL_WARMUP_BLUEPRINT_ID,
    blueprintVersion: 1,
    brandId: 'brand-1',
    completedItemIds: [],
    createdAt: '2026-08-08T10:00:00.000Z',
    credentialId: 'credential-1',
    currentPhaseId: 'gradual-first-uploads',
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

const health: AccountHealthSummary = {
  assessedAt: '2026-08-14T12:00:00.000Z',
  credentialId: 'credential-1',
  holdPublishing: true,
  holdReason: 'tiktok publishing is held because account warmup is warming.',
  label: 'Studio TikTok',
  override: { isActive: false },
  platform: CredentialPlatform.TIKTOK,
  riskLevel: 'medium',
  score: 42,
  signals: {
    connectedDays: 6,
    profileSignals: 2,
    publishedPosts: 0,
    recentFailures: 0,
  },
  state: 'warming',
  thresholds: {
    maxRecentFailures: 0,
    minConnectedDays: 3,
    minProfileSignals: 2,
    minPublishedPosts: 3,
  },
};

describe('SocialWarmupProgram', () => {
  const onOverrideRequest = vi.fn();
  const onReconnect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    completeItem.mockResolvedValue(createEnrollment());
    reopenItem.mockResolvedValue(createEnrollment());
    enroll.mockResolvedValue(createEnrollment());
    refresh.mockResolvedValue(undefined);
    refreshAuthorizedSignals.mockResolvedValue({});
    hookState = {
      completeItem,
      data: createEnrollment(),
      enroll,
      error: null,
      isLoading: false,
      refresh,
      reopenItem,
    };
  });

  it('renders readiness, score, day, progress, next action, and last refresh', () => {
    hookState.data = createEnrollment({
      completedItemIds: ['use-native-app-manually'],
      signals: [
        {
          brandId: 'brand-1',
          createdAt: '2026-08-14T11:00:00.000Z',
          enrollmentId: 'enrollment-1',
          evidence: {},
          id: 'signal-1',
          isDeleted: false,
          key: 'profile-completeness-signal',
          observedAt: '2026-08-14T11:00:00.000Z',
          organizationId: 'org-1',
          source: SocialWarmupSignalSource.PLATFORM,
          status: SocialWarmupSignalStatus.AVAILABLE,
          updatedAt: '2026-08-14T11:00:00.000Z',
        },
      ],
    });

    render(
      <SocialWarmupProgram
        connection={{
          credentialId: 'credential-1',
          handle: 'studio',
          name: 'Studio TikTok',
          platform: CredentialPlatform.TIKTOK,
        }}
        health={health}
        onOverrideRequest={onOverrideRequest}
      />,
    );

    expect(screen.getByText('Warm-up program')).toBeInTheDocument();
    expect(screen.getByText('Warming')).toBeInTheDocument();
    expect(screen.getByText('Score 42')).toBeInTheDocument();
    expect(screen.getByText('Day 7')).toBeInTheDocument();
    expect(screen.getByText('Gradual first uploads')).toBeInTheDocument();
    expect(screen.getByText(/of .* checks/)).toBeInTheDocument();
    expect(screen.getByText('Next')).toBeInTheDocument();
    expect(screen.getByText(/last refresh/i)).toBeInTheDocument();
  });

  it('auto-enrolls a supported account that is not enrolled yet', async () => {
    hookState.data = null;

    render(
      <SocialWarmupProgram
        connection={{
          credentialId: 'credential-1',
          platform: CredentialPlatform.TIKTOK,
        }}
        health={health}
      />,
    );

    await waitFor(() => {
      expect(enroll).toHaveBeenCalledWith('credential-1');
    });
  });

  it('checks in and reopens user-confirmed items', async () => {
    render(
      <SocialWarmupProgram
        connection={{
          credentialId: 'credential-1',
          platform: CredentialPlatform.TIKTOK,
        }}
        health={health}
      />,
    );

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Mark complete' })[0],
    );
    await waitFor(() => {
      expect(completeItem).toHaveBeenCalled();
    });

    hookState.data = createEnrollment({
      completedItemIds: ['continue-post-upload-engagement'],
    });
    render(
      <SocialWarmupProgram
        connection={{
          credentialId: 'credential-1',
          platform: CredentialPlatform.TIKTOK,
        }}
        health={health}
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Reopen' })[0]);
    await waitFor(() => {
      expect(reopenItem).toHaveBeenCalled();
    });
  });

  it('refreshes TikTok authorized signals and shows stale/error states', async () => {
    hookState.data = createEnrollment({
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
    });

    render(
      <SocialWarmupProgram
        connection={{
          credentialId: 'credential-1',
          platform: CredentialPlatform.TIKTOK,
        }}
        health={health}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Full blueprint' }));
    expect(
      screen.getAllByText(/authorized tiktok evidence is stale/i).length,
    ).toBeGreaterThan(0);

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Refresh signals' })[0],
    );
    await waitFor(() => {
      expect(refreshAuthorizedSignals).toHaveBeenCalledWith('credential-1');
      expect(refresh).toHaveBeenCalled();
    });
  });

  it('refreshes YouTube authorized signals from the shared enrollment UI', async () => {
    hookState.data = createEnrollment({
      blueprintId: YOUTUBE_SOCIAL_WARMUP_BLUEPRINT_ID,
      currentPhaseId: 'first-shorts',
    });

    render(
      <SocialWarmupProgram
        connection={{
          credentialId: 'credential-1',
          platform: CredentialPlatform.YOUTUBE,
        }}
        health={{
          ...health,
          holdReason:
            'youtube publishing is held because channel warmup is warming.',
          platform: CredentialPlatform.YOUTUBE,
        }}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Full blueprint' }));
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Refresh signals' })[0],
    );
    await waitFor(() => {
      expect(servicesPlatform).toHaveBeenCalledWith(
        resolveOAuthServicePath(CredentialPlatform.YOUTUBE),
      );
      expect(refreshAuthorizedSignals).toHaveBeenCalledWith('credential-1');
    });
  });

  it('refreshes LinkedIn authorized signals from the shared enrollment UI', async () => {
    hookState.data = createEnrollment({
      blueprintId: LINKEDIN_SOCIAL_WARMUP_BLUEPRINT_ID,
      currentPhaseId: 'thoughtful-participation',
    });

    render(
      <SocialWarmupProgram
        connection={{
          credentialId: 'credential-1',
          platform: CredentialPlatform.LINKEDIN,
        }}
        health={{
          ...health,
          holdReason:
            'linkedin publishing is held because profile warmup is warming.',
          platform: CredentialPlatform.LINKEDIN,
        }}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Full blueprint' }));
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Refresh signals' })[0],
    );
    await waitFor(() => {
      expect(refreshAuthorizedSignals).toHaveBeenCalledWith('credential-1');
    });
  });

  it('lists unmet hold checks and keeps override available', () => {
    render(
      <SocialWarmupProgram
        connection={{
          credentialId: 'credential-1',
          handle: 'studio',
          name: 'Studio TikTok',
          platform: CredentialPlatform.TIKTOK,
        }}
        health={health}
        onOverrideRequest={onOverrideRequest}
        onReconnect={onReconnect}
      />,
    );

    expect(screen.getByText('Publishing is on hold')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /show /i })[0]);
    expect(screen.getByRole('tab', { name: 'Full blueprint' })).toHaveAttribute(
      'data-state',
      'active',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Override 24h' }));
    expect(onOverrideRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialId: 'credential-1',
        unresolvedChecks: expect.arrayContaining([
          expect.objectContaining({ title: expect.any(String) }),
        ]),
      }),
    );
  });

  it('shows graduation copy that does not guarantee reach or safety', () => {
    render(
      <SocialWarmupProgram
        connection={{
          credentialId: 'credential-1',
          platform: CredentialPlatform.TIKTOK,
        }}
        health={health}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Full blueprint' }));
    expect(screen.getByText(/does not guarantee reach/i)).toBeInTheDocument();
    expect(
      screen.getByText(/does not guarantee reach/i).textContent,
    ).not.toMatch(/guarantee of (reach|safety)/i);
  });

  it('still lists unresolved checks when a manual override is active', () => {
    render(
      <SocialWarmupProgram
        connection={{
          credentialId: 'credential-1',
          platform: CredentialPlatform.TIKTOK,
        }}
        health={{
          ...health,
          holdPublishing: false,
          override: {
            expiresAt: '2026-08-15T12:00:00.000Z',
            isActive: true,
            reason: 'Manual override confirmed from brand social dashboard.',
          },
        }}
      />,
    );

    expect(screen.getByText('Unresolved checks')).toBeInTheDocument();
    expect(
      screen.getByText(
        /manual override confirmed from brand social dashboard/i,
      ),
    ).toBeInTheDocument();
  });
});
