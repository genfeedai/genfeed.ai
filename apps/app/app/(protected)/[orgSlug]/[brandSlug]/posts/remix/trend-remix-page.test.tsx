import '@testing-library/jest-dom';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoistedMocks = vi.hoisted(() => ({
  generateTweetsMock: vi.fn(),
  getPostsServiceMock: vi.fn(),
  notificationErrorMock: vi.fn(),
  notificationSuccessMock: vi.fn(),
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  searchParamsState: new URLSearchParams(),
  useBrandMock: vi.fn(),
}));
const desktopRuntimeMocks = vi.hoisted(() => ({
  getDesktopBridge: vi.fn(),
  isDesktopShell: vi.fn(),
}));
const {
  generateTweetsMock,
  getPostsServiceMock,
  notificationSuccessMock,
  replaceMock,
  searchParamsState,
  useBrandMock,
} = hoistedMocks;

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => hoistedMocks.useBrandMock(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => hoistedMocks.getPostsServiceMock,
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/moonrise-org/moonrise-studio${path}`,
    orgHref: (path: string) => `/moonrise-org/~${path}`,
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: hoistedMocks.pushMock,
    replace: hoistedMocks.replaceMock,
  }),
  useSearchParams: () => hoistedMocks.searchParamsState,
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: hoistedMocks.notificationErrorMock,
      success: hoistedMocks.notificationSuccessMock,
    }),
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock('@/lib/desktop/runtime', () => ({
  getDesktopBridge: desktopRuntimeMocks.getDesktopBridge,
  isDesktopShell: desktopRuntimeMocks.isDesktopShell,
}));

import TrendRemixPage from './trend-remix-page';

describe('TrendRemixPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsState.forEach((_, key) => {
      searchParamsState.delete(key);
    });
    searchParamsState.set('topic', 'AI operating systems');
    useBrandMock.mockReturnValue({
      credentials: [],
      isReady: true,
    });
    getPostsServiceMock.mockResolvedValue({
      generateTweets: generateTweetsMock,
    });
    desktopRuntimeMocks.getDesktopBridge.mockReturnValue(null);
    desktopRuntimeMocks.isDesktopShell.mockReturnValue(false);
  });

  it('generates a local desktop remix when no cloud credential is available', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      content: 'Generated desktop remix',
      id: 'generated-local-remix',
      platform: 'twitter',
      type: 'caption',
    });
    const queueJob = vi.fn().mockResolvedValue({ id: 'sync-job-1' });
    useBrandMock.mockReturnValue({
      credentials: [],
      isReady: false,
    });
    desktopRuntimeMocks.isDesktopShell.mockReturnValue(true);
    desktopRuntimeMocks.getDesktopBridge.mockReturnValue({
      cloud: { generateContent },
      sync: { queueJob },
    });

    render(<TrendRemixPage />);

    await waitFor(() => {
      expect(generateContent).toHaveBeenCalledWith({
        platform: 'twitter',
        prompt: expect.stringContaining('AI operating systems'),
        publishIntent: 'review',
        type: 'caption',
      });
    });

    expect(queueJob).toHaveBeenCalledWith(
      'post-draft',
      expect.stringContaining('Generated desktop remix'),
    );
    expect(replaceMock).toHaveBeenCalledWith(
      '/moonrise-org/moonrise-studio/compose/post?description=Generated+desktop+remix&title=AI+operating+systems',
    );
    expect(notificationSuccessMock).toHaveBeenCalledWith(
      'Tweet remix draft created',
    );
  });

  it('uses the cloud post generation path when a Twitter credential exists', async () => {
    useBrandMock.mockReturnValue({
      credentials: [
        {
          id: 'cred-twitter',
          platform: 'twitter',
        },
      ],
      isReady: true,
    });
    generateTweetsMock.mockResolvedValue([{ id: 'post-1' }]);

    render(<TrendRemixPage />);

    await waitFor(() => {
      expect(generateTweetsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          count: 1,
          credential: 'cred-twitter',
          topic: expect.stringContaining('AI operating systems'),
        }),
      );
    });

    expect(replaceMock).toHaveBeenCalledWith('/posts?platform=twitter');
    expect(desktopRuntimeMocks.getDesktopBridge).not.toHaveBeenCalled();
  });
});
