import { CredentialPlatform } from '@genfeedai/contracts';
import { tiktokAuthorizedSignalEvidenceKeys } from '@genfeedai/contracts/api-types/contracts';
import type { IPost } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TikTokPublishingSettings from '@ui/posts/tiktok-publishing/TikTokPublishingSettings';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const { refresh, updateTarget, notify, getTikTok, getReleases } = vi.hoisted(
  () => {
    const refresh = vi.fn();
    const updateTarget = vi.fn();
    const notify = vi.fn();
    const tiktok = { refreshAuthorizedSignals: refresh };
    const releases = { updateTarget, ensureFromPost: vi.fn() };
    return {
      refresh,
      updateTarget,
      notify,
      getTikTok: () => Promise.resolve(tiktok),
      getReleases: () => Promise.resolve(releases),
    };
  },
);
vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => { kind: string }) =>
    factory('token').kind === 'tiktok' ? getTikTok : getReleases,
}));
vi.mock('@genfeedai/services/external/services.service', () => ({
  ServicesService: class {
    kind = 'tiktok';
  },
}));
vi.mock('@genfeedai/services/content/release-groups.service', () => ({
  ReleaseGroupsService: { getInstance: () => ({ kind: 'releases' }) },
}));
vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: { getInstance: () => ({ success: notify }) },
}));

const observedAt = '2026-10-12T04:00:00.000Z';
function credential(status = 'available') {
  return {
    warmupSignals: {
      tiktokAuthorized: {
        credentialId: 'credential-1',
        grantedScopes: [],
        platform: CredentialPlatform.TIKTOK,
        refreshAttemptedAt: observedAt,
        state: 'partial',
        evidence: tiktokAuthorizedSignalEvidenceKeys.map((key) => ({
          key,
          fieldAvailability: {},
          observedAt,
          scope: { granted: [], missing: [], required: [] },
          staleAt: null,
          status:
            key === 'creator-capabilities-snapshot' ? status : 'available',
          provenance:
            key === 'genfeed-publish-activity'
              ? 'genfeed_observed'
              : 'platform_verified',
          ...(key === 'genfeed-publish-activity'
            ? { value: { attempts: [] } }
            : {}),
          ...(key === 'creator-capabilities-snapshot'
            ? {
                value: {
                  creatorNickname: 'Test Creator',
                  creatorUsername: 'testcreator',
                  privacyLevelOptions: ['SELF_ONLY'],
                  commentDisabled: false,
                  duetDisabled: true,
                  stitchDisabled: false,
                  maxVideoPostDurationSeconds: 60,
                },
              }
            : {}),
        })),
      },
    },
  };
}

const post = {
  id: 'post-1',
  groupId: 'group-1',
  credentialId: 'credential-1',
  ingredients: [{ id: 'video-1', metadata: { duration: 5 } }],
  targetExecutionState: 'DRAFT',
} as unknown as IPost;

describe('TikTok publishing settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
    refresh.mockResolvedValue(credential());
    updateTarget.mockResolvedValue({});
  });

  it('shows the real creator and leaves privacy and interactions unselected', async () => {
    render(<TikTokPublishingSettings post={post} />);
    await screen.findByText('Test Creator');
    expect(screen.getByRole('combobox')).toHaveTextContent('Choose privacy');
    expect(
      screen.getByRole('checkbox', { name: 'Allow comments' }),
    ).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Allow duet' })).toBeDisabled();
    expect(
      screen.getByRole('checkbox', { name: 'Allow stitch' }),
    ).not.toBeChecked();
    expect(
      screen.getByRole('button', { name: 'Save TikTok settings' }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('combobox'));
    expect(
      await screen.findByRole('option', { name: 'Only me' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'Everyone' }),
    ).not.toBeInTheDocument();
  });

  it('refuses stale capabilities and keeps publishing unavailable', async () => {
    refresh.mockResolvedValue(credential('stale'));
    const onReadinessChange = vi.fn();
    render(
      <TikTokPublishingSettings
        post={post}
        onReadinessChange={onReadinessChange}
      />,
    );
    await screen.findByRole('alert');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(onReadinessChange).not.toHaveBeenCalledWith(true);
    expect(updateTarget).not.toHaveBeenCalled();
  });

  it('blocks videos longer than the freshly returned creator limit', async () => {
    render(
      <TikTokPublishingSettings
        post={{
          ...post,
          ingredients: [
            { id: 'video-1', metadata: { duration: 61 } },
          ] as IPost['ingredients'],
        }}
      />,
    );
    await screen.findByText('Test Creator');
    expect(screen.getByRole('alert')).toHaveTextContent('exceeds');
    expect(
      screen.getByRole('button', { name: 'Save TikTok settings' }),
    ).toBeDisabled();
  });

  it('saves explicit choices to the canonical target, then refreshes the post', async () => {
    const onSaved = vi.fn().mockResolvedValue(undefined);
    render(<TikTokPublishingSettings post={post} onSaved={onSaved} />);
    await screen.findByText('Test Creator');
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: 'Only me' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /By posting/ }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Save TikTok settings' }),
    );
    await waitFor(() =>
      expect(updateTarget).toHaveBeenCalledWith(
        'group-1',
        'post-1',
        expect.objectContaining({
          settings: {
            privacyLevel: 'private',
            musicUsageAccepted: true,
            allowComments: false,
            allowDuet: false,
            allowStitch: false,
          },
          visibility: 'private',
        }),
      ),
    );
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it('blocks publishing when saved disclosure flags change after the form opens', async () => {
    const onReadinessChange = vi.fn();
    const savedSettings = {
      privacyLevel: 'private',
      musicUsageAccepted: true,
      allowComments: false,
      allowDuet: false,
      allowStitch: false,
    };
    const { rerender } = render(
      <TikTokPublishingSettings
        post={{ ...post, targetSettings: savedSettings }}
        onReadinessChange={onReadinessChange}
      />,
    );
    await waitFor(() =>
      expect(onReadinessChange).toHaveBeenLastCalledWith(true),
    );
    onReadinessChange.mockClear();

    rerender(
      <TikTokPublishingSettings
        post={{
          ...post,
          targetSettings: {
            ...savedSettings,
            commercialContent: true,
            yourBrand: true,
          },
        }}
        onReadinessChange={onReadinessChange}
      />,
    );

    await waitFor(() =>
      expect(onReadinessChange).toHaveBeenLastCalledWith(false),
    );
    expect(updateTarget).not.toHaveBeenCalled();
  });
});
