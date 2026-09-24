import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ImportedPostsPage } from '~components/pages/ImportedPostsPage';
import { useBrandStore } from '~store/use-brand-store';

vi.mock('~components/settings/BrandSelector', () => ({
  BrandSelector: () => (
    <button
      onClick={() => useBrandStore.getState().setActiveBrand('brand-a')}
      type="button"
    >
      Choose Brand A
    </button>
  ),
}));

const importedPost = {
  authorDisplayName: 'Author',
  authorHandle: 'author',
  collectedAt: null,
  id: 'post-1',
  platform: 'twitter',
  sourceUrl: 'https://x.com/author/status/123',
  text: 'Original post',
};

beforeEach(() => {
  useBrandStore.setState({ activeBrandId: null, brands: [] });
  vi.mocked(chrome.runtime.sendMessage).mockImplementation(async (message) => {
    if (message.event === 'listImportedPosts') {
      return { data: [importedPost], success: true };
    }
    if (message.event === 'savePost') {
      return { deduplicated: false, success: true };
    }
    return { success: true };
  });
  vi.mocked(chrome.tabs.create).mockResolvedValue({ id: 1 } as never);
});

describe('Imported posts panel', () => {
  it('imports through the existing API and keeps Knowledge explicit', async () => {
    const onAddToKnowledge = vi.fn();
    render(
      <ImportedPostsPage
        initialUrl="https://x.com/author/status/123"
        onAddToKnowledge={onAddToKnowledge}
      />,
    );

    expect(screen.getByRole('button', { name: 'Import post' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Choose Brand A' }));

    expect(await screen.findByText('Author @author')).toBeInTheDocument();
    expect(screen.getByText('Imported · twitter')).toBeInTheDocument();
    expect(screen.getByText('Original post')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Import post' }));
    await waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId: 'brand-a',
          event: 'savePost',
          url: 'https://x.com/author/status/123',
        }),
      ),
    );
    expect(
      await screen.findByText(/Generation did not start/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add to Knowledge' }));
    expect(onAddToKnowledge).toHaveBeenCalledWith(
      'https://x.com/author/status/123',
    );
    const saveCalls = vi
      .mocked(chrome.runtime.sendMessage)
      .mock.calls.filter((call) => call[0]?.event === 'savePost');
    expect(saveCalls).toHaveLength(1);
    expect(
      vi
        .mocked(chrome.runtime.sendMessage)
        .mock.calls.some((call) => call[0]?.event === 'captureSave'),
    ).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Remix' }));
    await waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId: 'brand-a',
          event: 'openImportedRemix',
          platform: 'twitter',
          postId: 'post-1',
        }),
      ),
    );
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  it('ignores a deferred import after the selected brand changes', async () => {
    let releaseSave: ((value: unknown) => void) | undefined;
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(
      async (message) => {
        if (
          message.event === 'listImportedPosts' &&
          message.brandId === 'brand-a'
        ) {
          return {
            data: [
              {
                ...importedPost,
                authorDisplayName: 'Ada',
                authorHandle: 'ada',
                id: 'post-a',
                text: 'Brand A post',
              },
            ],
            success: true,
          };
        }
        if (
          message.event === 'listImportedPosts' &&
          message.brandId === 'brand-b'
        ) {
          return {
            data: [
              {
                ...importedPost,
                authorDisplayName: 'Bea',
                authorHandle: 'bea',
                id: 'post-b',
                text: 'Brand B post',
              },
            ],
            success: true,
          };
        }
        if (message.event === 'savePost') {
          return new Promise((resolve) => {
            releaseSave = resolve;
          });
        }
        return { success: true };
      },
    );

    render(
      <ImportedPostsPage
        initialUrl="https://x.com/author/status/123"
        onAddToKnowledge={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Choose Brand A' }));
    expect(await screen.findByText('Brand A post')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Import post' }));
    useBrandStore.getState().setActiveBrand('brand-b');
    expect(await screen.findByText('Brand B post')).toBeInTheDocument();
    expect(screen.queryByText('Brand A post')).toBeNull();

    releaseSave?.({ deduplicated: false, success: true });
    await waitFor(() =>
      expect(screen.queryByText(/Generation did not start/)).toBeNull(),
    );
    expect(screen.getByText('Brand B post')).toBeInTheDocument();
    expect(screen.queryByText('Brand A post')).toBeNull();
  });
});
