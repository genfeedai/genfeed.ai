import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLivestreamChatBotPage } from '@/features/agents/library/useLivestreamChatBotPage';

const mocks = vi.hoisted(() => ({
  brandId: 'brand-1' as string | undefined,
  findAllByOrganization: vi.fn(),
  findCredentials: vi.fn(),
  getLivestreamSession: vi.fn(),
  organizationId: 'org-1',
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));

vi.mock('@hooks/navigation/use-collection-scope/use-collection-scope', () => ({
  useCollectionScope: () => ({
    brandId: mocks.brandId,
    isReady: true,
    organizationId: mocks.organizationId,
    pageScope: 'brand',
  }),
}));

vi.mock('@services/automation/bots.service', () => ({
  BotsService: {
    getInstance: () => ({
      findAllByOrganization: mocks.findAllByOrganization,
      getLivestreamSession: mocks.getLivestreamSession,
    }),
  },
}));

vi.mock('@services/organization/credentials.service', () => ({
  CredentialsService: {
    getInstance: () => ({ findAll: mocks.findCredentials }),
  },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ error: vi.fn(), success: vi.fn() }),
  },
}));

const YOUTUBE_BOT = {
  brandId: 'brand-1',
  description: 'Drops links during the show',
  id: 'bot-1',
  label: 'Friday Stream Bot',
  platforms: ['youtube'],
  targets: [{ channelId: 'UC-friday', platform: 'youtube' }],
};

const ACTIVE_SESSION = {
  context: {},
  deliveryHistory: [],
  platformStates: [],
  status: 'active',
};

describe('useLivestreamChatBotPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.brandId = 'brand-1';
    mocks.organizationId = 'org-1';
    mocks.findAllByOrganization.mockResolvedValue([YOUTUBE_BOT]);
    mocks.getLivestreamSession.mockResolvedValue(ACTIVE_SESSION);
    mocks.findCredentials.mockResolvedValue([
      { externalHandle: 'restream-main', id: 'cred-restream-1' },
    ]);
  });

  it('paints the cached bot, session and Restream picker at once when coming back', async () => {
    const client = createTestQueryClient();
    const firstVisit = renderHook(() => useLivestreamChatBotPage('youtube'), {
      wrapper: queryClientWrapper(client),
    });
    await waitFor(() => {
      expect(firstVisit.result.current.session?.status).toBe('active');
    });
    await waitFor(() => {
      expect(firstVisit.result.current.restreamCredentials).toEqual([
        { id: 'cred-restream-1', label: 'restream-main' },
      ]);
    });
    firstVisit.unmount();

    mocks.findAllByOrganization.mockReturnValue(new Promise(() => {}));
    mocks.getLivestreamSession.mockReturnValue(new Promise(() => {}));
    mocks.findCredentials.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useLivestreamChatBotPage('youtube'), {
      wrapper: queryClientWrapper(client),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.form.label).toBe('Friday Stream Bot');
    expect(result.current.form.youtubeChannelId).toBe('UC-friday');
    expect(result.current.session?.status).toBe('active');
    expect(result.current.restreamCredentials).toEqual([
      { id: 'cred-restream-1', label: 'restream-main' },
    ]);
  });

  it('never shows one brand’s bot under another brand', async () => {
    const client = createTestQueryClient();
    const firstBrand = renderHook(() => useLivestreamChatBotPage('youtube'), {
      wrapper: queryClientWrapper(client),
    });
    await waitFor(() => {
      expect(firstBrand.result.current.form.label).toBe('Friday Stream Bot');
    });
    firstBrand.unmount();

    mocks.brandId = 'brand-2';
    mocks.findAllByOrganization.mockReturnValue(new Promise(() => {}));
    mocks.findCredentials.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useLivestreamChatBotPage('youtube'), {
      wrapper: queryClientWrapper(client),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.form.label).toBe('Livestream Chat Bot');
    expect(result.current.session).toBeNull();
    expect(result.current.restreamCredentials).toEqual([]);
  });
});
