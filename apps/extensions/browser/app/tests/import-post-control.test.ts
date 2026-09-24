import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PlatformConfig } from '~platforms/config';
import {
  attachImportMenuItem,
  attachViewedPostImport,
} from '~platforms/import-post-control';

function platform(): PlatformConfig {
  return {
    constructPostUrl: (postId: string) =>
      `https://x.com/author/status/${postId}`,
    extractPostId: () => '123',
    selectors: { actionsContainer: '[role="group"]' },
  } as PlatformConfig;
}

describe('import post controls', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.mocked(chrome.runtime.sendMessage).mockReset();
  });

  it('injects the save button on the viewed post', () => {
    document.body.innerHTML = '<div role="group"></div>';
    attachViewedPostImport(platform(), 'twitter');
    attachViewedPostImport(platform(), 'twitter');

    const buttons = document.querySelectorAll('[data-genfeed-import="123"]');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.getAttribute('title')).toBe('Import post');
  });

  it('adds an Import post menu item that reports an existing source', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
      deduplicated: true,
      success: true,
    });
    const dropdown = document.createElement('div');
    const menu = document.createElement('div');
    menu.className = 'genfeed-dropdown-menu';
    dropdown.appendChild(menu);

    attachImportMenuItem({
      dropdown,
      platform: 'twitter',
      postId: '123',
      postUrl: 'https://x.com/author/status/123',
    });

    const item = dropdown.querySelector(
      '[data-genfeed-import-menu]',
    ) as HTMLButtonElement;
    expect(item.textContent).toBe('Import post');
    item.click();

    await vi.waitFor(() => expect(item.textContent).toBe('Already imported'));
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'savePost',
        postId: '123',
        url: 'https://x.com/author/status/123',
      }),
    );
  });
});
