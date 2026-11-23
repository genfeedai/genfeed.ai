'use client';

import type { ContentMentionItem } from '@genfeedai/agent/types/mention.types';
import type { ContentLibraryPickerProps } from '@genfeedai/props/agent/content-library-picker.props';
import type { LibraryGridItem } from '@genfeedai/props/ui/content/library-picker.props';
import LibraryPicker from '@ui/content/library-picker/LibraryPicker';
import { type ReactElement, useMemo, useState } from 'react';

export type { ContentLibraryPickerProps } from '@genfeedai/props/agent/content-library-picker.props';

const EMPTY_ITEMS: readonly ContentMentionItem[] = [];

function toGridItem(item: ContentMentionItem): LibraryGridItem {
  return {
    id: item.id,
    kind: item.contentType,
    thumbnailUrl: item.thumbnailUrl,
    title: item.contentTitle,
  };
}

/**
 * The agent's Library attach dialog. It owns what is agent-specific: the
 * mention items, local or remote search, and the knowledge section. The
 * dialog, search field and grid are the shared `LibraryPicker`.
 */
export function ContentLibraryPicker({
  isOpen,
  title = 'Reference library content',
  description = 'Pick posts or assets to attach as visual references, and choose the brand knowledge that grounds your message.',
  footer,
  isLoading = false,
  items = EMPTY_ITEMS,
  selectedIds,
  knowledgeSection,
  onOpenChange,
  onSelect,
  ...search
}: ContentLibraryPickerProps): ReactElement {
  const [localQuery, setQuery] = useState('');
  const query =
    search.searchMode === 'remote' ? search.searchQuery : localQuery;

  if (!isOpen && localQuery !== '') {
    setQuery('');
  }

  const gridItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const visible =
      search.searchMode === 'remote' || !normalizedQuery
        ? items
        : items.filter(
            (item) =>
              item.contentTitle.toLowerCase().includes(normalizedQuery) ||
              item.contentType.toLowerCase().includes(normalizedQuery),
          );

    return visible.map(toGridItem);
  }, [items, query, search.searchMode]);

  const itemsById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );

  const hasNoLibraryContent =
    items.length === 0 && !(search.searchMode === 'remote' && query.trim());

  return (
    <LibraryPicker
      description={description}
      emptyLabel={
        hasNoLibraryContent
          ? 'No library content available yet.'
          : 'No matching content.'
      }
      footer={footer}
      getItemAriaLabel={(item) => `Reference ${item.title}`}
      gridLabel="Library content"
      isLoading={isLoading}
      isOpen={isOpen}
      isSelectedLocked
      items={gridItems}
      loadingLabel="Loading library"
      onOpenChange={onOpenChange}
      onQueryChange={
        search.searchMode === 'remote' ? search.onSearchQueryChange : setQuery
      }
      onSelect={(item) => {
        const mention = itemsById.get(item.id);
        if (mention) {
          onSelect(mention);
        }
      }}
      query={query}
      searchLabel="Search library content"
      searchPlaceholder={
        search.searchMode === 'remote'
          ? 'Search your Library…'
          : 'Search by title or type…'
      }
      selectedIds={selectedIds}
      title={title}
      topSection={knowledgeSection}
    />
  );
}
