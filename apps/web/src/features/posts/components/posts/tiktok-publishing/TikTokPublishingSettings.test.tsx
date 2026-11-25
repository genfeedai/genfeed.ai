import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import { CredentialPlatform } from '@genfeedai/contracts';
import { tiktokAuthorizedSignalEvidenceKeys } from '@genfeedai/contracts/api-types/contracts';
import type { IPost } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TikTokPublishingSettings from '@/features/posts/components/posts/tiktok-publishing/TikTokPublishingSettings';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const {
  refresh,
  updateTarget,
  notify,
  getTikTok,
  getReleases,
  ensureFromPost,
} = vi.hoisted(() => {
  const refresh = vi.fn();
  const updateTarget = vi.fn();
  const ensureFromPost = vi.fn();
  const notify = vi.fn();
  const tiktok = { refreshAuthorizedSignals: refresh };
  const releases = { updateTarget, ensureFromPost };
  return {
    refresh,
    updateTarget,
    notify,
    ensureFromPost,
    getTikTok: () => Promise.resolve(tiktok),
    getReleases: () => Promise.resolve(releases),
  };
});
vi.mock(
  '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity',
  async () => ({
    useAuthIdentity: (await import('@app-tests/query-client.harness'))
      .useTestViewer,
  }),
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
  let wrapper: ReturnType<typeof queryClientWrapper>;
  beforeEach(() => {
    wrapper = queryClientWrapper(createTestQueryClient());
    vi.clearAllMocks();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
    refresh.mockResolvedValue(credential());
    updateTarget.mockResolvedValue({});
    ensureFromPost.mockResolvedValue({ id: 'release-from-post' });
  });

  it('shows the real creator and leaves privacy and interactions unselected', async () => {
    render(<TikTokPublishingSettings post={post} />, { wrapper });
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

  it('shows its own title by default and drops it when embedded in a host section', async () => {
    const { unmount } = render(<TikTokPublishingSettings post={post} />, {
      wrapper,
    });
    await screen.findByText('Test Creator');
    expect(
      screen.getByRole('heading', { name: 'Post to TikTok' }),
    ).toBeInTheDocument();
    unmount();

    render(<TikTokPublishingSettings post={post} isEmbedded />, { wrapper });
    await screen.findByText('Test Creator');
    expect(
      screen.queryByRole('heading', { name: 'Post to TikTok' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'TikTok publishing settings' }),
    ).not.toHaveClass('border');
  });

  it('refuses stale capabilities and keeps publishing unavailable', async () => {
    refresh.mockResolvedValue(credential('stale'));
    const onReadinessChange = vi.fn();
    render(
      <TikTokPublishingSettings
        post={post}
        onReadinessChange={onReadinessChange}
      />,
      { wrapper },
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
      { wrapper },
    );
    await screen.findByText('Test Creator');
    expect(screen.getByRole('alert')).toHaveTextContent('exceeds');
    expect(
      screen.getByRole('button', { name: 'Save TikTok settings' }),
    ).toBeDisabled();
  });

  it('saves explicit choices to the canonical target, then refreshes the post', async () => {
    const onSaved = vi.fn().mockResolvedValue(undefined);
    render(<TikTokPublishingSettings post={post} onSaved={onSaved} />, {
      wrapper,
    });
    await screen.findByText('Test Creator');
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: 'Only me' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /By posting/ }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Save TikTok settings' }),
    );
    await waitFor(() =>
      expect(updateTarget).toHaveBeenCalledWith(
        'release-from-post',
        'post-1',
        expect.objectContaining({
          settings: {
            aiGenerated: true,
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
    expect(ensureFromPost).toHaveBeenCalledWith('post-1');
    expect(updateTarget.mock.calls[0]?.[2].settings).not.toHaveProperty(
      'privacyStatus',
    );
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it('labels the post as AI-generated by default and saves the choice to turn it off', async () => {
    render(<TikTokPublishingSettings post={post} />, { wrapper });
    await screen.findByText('Test Creator');
    const label = screen.getByRole('checkbox', {
      name: 'Label as AI-generated',
    });
    expect(label).toBeChecked();

    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: 'Only me' }));
    fireEvent.click(label);
    fireEvent.click(screen.getByRole('checkbox', { name: /By posting/ }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Save TikTok settings' }),
    );
    await waitFor(() => expect(updateTarget).toHaveBeenCalledOnce());
    expect(updateTarget.mock.calls[0]?.[2].settings).toMatchObject({
      aiGenerated: false,
    });
  });

  it('stays ready for a post saved before the AI label existed', async () => {
    const onReadinessChange = vi.fn();
    render(
      <TikTokPublishingSettings
        post={{
          ...post,
          targetSettings: {
            privacyLevel: 'private',
            musicUsageAccepted: true,
            allowComments: false,
            allowDuet: false,
            allowStitch: false,
          },
        }}
        onReadinessChange={onReadinessChange}
      />,
      { wrapper },
    );
    await waitFor(() =>
      expect(onReadinessChange).toHaveBeenLastCalledWith(true),
    );
    expect(
      screen.getByRole('checkbox', { name: 'Label as AI-generated' }),
    ).toBeChecked();
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
      { wrapper },
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
