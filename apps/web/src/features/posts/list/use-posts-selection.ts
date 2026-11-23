'use client';

import type { IPost } from '@genfeedai/contracts/interfaces';
import { useCallback, useMemo, useState } from 'react';

/**
 * The posts ticked in the list, for a bulk action. Only posts on the current
 * page count, so a page or filter change never acts on posts out of sight.
 */
export function usePostsSelection(posts: IPost[]) {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const selectedPosts = useMemo(
    () => posts.filter((post) => selectedIds.has(post.id)),
    [posts, selectedIds],
  );

  const toggleSelect = useCallback((post: IPost) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (!next.delete(post.id)) {
        next.add(post.id);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const dropFromSelection = useCallback((removedIds: string[]) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      for (const id of removedIds) {
        next.delete(id);
      }
      return next;
    });
  }, []);

  return {
    clearSelection,
    dropFromSelection,
    selectedIds,
    selectedPosts,
    toggleSelect,
  };
}
