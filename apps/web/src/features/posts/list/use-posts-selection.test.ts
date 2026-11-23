import type { IPost } from '@genfeedai/contracts/interfaces';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { usePostsSelection } from '@/features/posts/list/use-posts-selection';

const posts = [{ id: 'a' }, { id: 'b' }, { id: 'c' }] as IPost[];

describe('usePostsSelection', () => {
  it('toggles a post in and out of the selection', () => {
    const { result } = renderHook(() => usePostsSelection(posts));

    act(() => result.current.toggleSelect(posts[0]));
    act(() => result.current.toggleSelect(posts[2]));
    expect(result.current.selectedPosts.map((post) => post.id)).toEqual([
      'a',
      'c',
    ]);

    act(() => result.current.toggleSelect(posts[0]));
    expect(result.current.selectedPosts.map((post) => post.id)).toEqual(['c']);
  });

  it('drops removed posts and clears the rest', () => {
    const { result } = renderHook(() => usePostsSelection(posts));
    act(() => {
      result.current.toggleSelect(posts[0]);
      result.current.toggleSelect(posts[1]);
    });

    act(() => result.current.dropFromSelection(['a']));
    expect(result.current.selectedPosts.map((post) => post.id)).toEqual(['b']);

    act(() => result.current.clearSelection());
    expect(result.current.selectedPosts).toEqual([]);
  });

  it('acts only on posts of the current page', () => {
    const { result, rerender } = renderHook(
      ({ page }) => usePostsSelection(page),
      { initialProps: { page: posts } },
    );
    act(() => result.current.toggleSelect(posts[1]));

    rerender({ page: [posts[0], posts[2]] });

    expect(result.current.selectedPosts).toEqual([]);
  });
});
