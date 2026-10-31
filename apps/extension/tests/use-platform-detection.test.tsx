import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlatformDetection } from '~hooks/use-platform-detection';
import { usePlatformStore } from '~store/use-platform-store';

beforeEach(() => {
  usePlatformStore.setState({
    composeBoxAvailable: false,
    currentPlatform: null,
    pageContext: {},
  });
  vi.mocked(chrome.tabs.query).mockResolvedValue([
    { id: 7 } as chrome.tabs.Tab,
  ]);
});
afterEach(() => {
  cleanup();
  vi.mocked(chrome.tabs.sendMessage).mockReset();
});

describe('usePlatformDetection', () => {
  it('learns the platform from the page when the panel opens after the page loaded', async () => {
    vi.mocked(chrome.tabs.sendMessage).mockResolvedValue({
      composeBoxAvailable: true,
      pageContext: { url: 'https://x.com/home' },
      platform: 'twitter',
      success: true,
    });

    renderHook(usePlatformDetection);

    await waitFor(() =>
      expect(usePlatformStore.getState().currentPlatform).toBe('twitter'),
    );
    expect(usePlatformStore.getState().composeBoxAvailable).toBe(true);
    expect(usePlatformStore.getState().pageContext.url).toBe(
      'https://x.com/home',
    );
  });

  it('forgets the platform of a page the extension is not on', async () => {
    usePlatformStore.setState({
      composeBoxAvailable: true,
      currentPlatform: 'twitter',
    });
    vi.mocked(chrome.tabs.sendMessage).mockRejectedValue(
      new Error('Receiving end does not exist.'),
    );

    renderHook(usePlatformDetection);

    await waitFor(() =>
      expect(usePlatformStore.getState().currentPlatform).toBeNull(),
    );
    expect(usePlatformStore.getState().composeBoxAvailable).toBe(false);
  });
});
