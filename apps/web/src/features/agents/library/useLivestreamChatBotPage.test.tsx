import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLivestreamChatBotPage } from '@/features/agents/library/useLivestreamChatBotPage';

const mocks = vi.hoisted(() => ({
  brandId: 'brand-1' as string | undefined,
  findAllByOrganization: vi.fn(),
  findCredentials: vi.fn(),
  getLivestreamSession: vi.fn(),
  organizationId: 'org-1',
  patch: vi.fn(),
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
      patch: mocks.patch,
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

  it('re-reads a brandless bot under another brand after it is saved here', async () => {
    const SHARED_BOT = { ...YOUTUBE_BOT, brandId: undefined };
    mocks.findAllByOrganization.mockResolvedValue([SHARED_BOT]);
    // The app's default: a revisit within 30s paints the cache without a read.
    const client = createTestQueryClient();
    client.setDefaultOptions({
      queries: { ...client.getDefaultOptions().queries, staleTime: 30_000 },
    });

    mocks.brandId = 'brand-2';
    const otherBrand = renderHook(() => useLivestreamChatBotPage('youtube'), {
      wrapper: queryClientWrapper(client),
    });
    await waitFor(() => {
      expect(otherBrand.result.current.form.label).toBe('Friday Stream Bot');
    });
    otherBrand.unmount();

    mocks.brandId = 'brand-1';
    const savedBot = { ...SHARED_BOT, label: 'Saturday Stream Bot' };
    mocks.patch.mockResolvedValue(savedBot);
    const thisBrand = renderHook(() => useLivestreamChatBotPage('youtube'), {
      wrapper: queryClientWrapper(client),
    });
    await waitFor(() => {
      expect(thisBrand.result.current.form.label).toBe('Friday Stream Bot');
    });
    act(() => {
      thisBrand.result.current.setForm((current) => ({
        ...current,
        label: 'Saturday Stream Bot',
      }));
    });
    mocks.findAllByOrganization.mockResolvedValue([savedBot]);
    await act(() => thisBrand.result.current.handleSave());
    thisBrand.unmount();

    mocks.brandId = 'brand-2';
    const { result } = renderHook(() => useLivestreamChatBotPage('youtube'), {
      wrapper: queryClientWrapper(client),
    });

    await waitFor(() => {
      expect(result.current.form.label).toBe('Saturday Stream Bot');
    });
  });

  it('drops unsaved edits when the open page switches brand', async () => {
    const view = renderHook(() => useLivestreamChatBotPage('youtube'), {
      wrapper: queryClientWrapper(createTestQueryClient()),
    });
    await waitFor(() => {
      expect(view.result.current.form.label).toBe('Friday Stream Bot');
    });
    act(() => {
      view.result.current.setForm((current) => ({
        ...current,
        label: 'Unsaved label',
      }));
    });

    mocks.brandId = 'brand-2';
    mocks.findAllByOrganization.mockReturnValue(new Promise(() => {}));
    view.rerender();

    await waitFor(() => {
      expect(view.result.current.form.label).toBe('Livestream Chat Bot');
    });
  });
});
