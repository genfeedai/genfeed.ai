import type {
  DiscoveryDeskItem,
  DiscoveryDeskSort,
  DiscoveryDeskSource,
} from '@props/trends/discovery-desk.props';

export type DiscoveryDeskContentTypeFilter = 'all' | 'video' | 'image' | 'post';

export interface DiscoveryDeskFilters {
  platforms: Set<string>;
  source: DiscoveryDeskSource | 'all';
  contentType: DiscoveryDeskContentTypeFilter;
  search: string;
}

export interface DiscoveryDeskState {
  filters: DiscoveryDeskFilters;
  sort: DiscoveryDeskSort;
  /** Item keys (`DiscoveryDeskItem.key`), in-memory only — not URL-backed. */
  selection: Set<string>;
  /** In-memory only — not URL-backed. */
  cursorKey: string | null;
}

export type DiscoveryDeskAction =
  | { type: 'TOGGLE_PLATFORM'; platform: string }
  | { type: 'SET_PLATFORMS'; platforms: Set<string> }
  | { type: 'SET_SOURCE'; source: DiscoveryDeskSource | 'all' }
  | {
      type: 'SET_CONTENT_TYPE';
      contentType: DiscoveryDeskContentTypeFilter;
    }
  | { type: 'SET_SORT'; sort: DiscoveryDeskSort }
  | { type: 'SET_SEARCH'; search: string }
  | { type: 'TOGGLE_SELECT'; key: string }
  | { type: 'SELECT_ALL_VISIBLE'; keys: string[] }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'MOVE_CURSOR'; direction: 1 | -1; visibleKeys: string[] }
  | { type: 'SET_CURSOR'; key: string | null };

export function createInitialDeskState(): DiscoveryDeskState {
  return {
    cursorKey: null,
    filters: {
      contentType: 'all',
      platforms: new Set(),
      search: '',
      source: 'all',
    },
    selection: new Set(),
    sort: 'velocity',
  };
}

function toggleSetMember<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}

function moveCursor(
  cursorKey: string | null,
  direction: 1 | -1,
  visibleKeys: string[],
): string | null {
  if (visibleKeys.length === 0) {
    return null;
  }

  const currentIndex = cursorKey ? visibleKeys.indexOf(cursorKey) : -1;
  if (currentIndex === -1) {
    return direction === 1
      ? visibleKeys[0]
      : visibleKeys[visibleKeys.length - 1];
  }

  const nextIndex = Math.min(
    Math.max(currentIndex + direction, 0),
    visibleKeys.length - 1,
  );
  return visibleKeys[nextIndex];
}

export function discoveryDeskReducer(
  state: DiscoveryDeskState,
  action: DiscoveryDeskAction,
): DiscoveryDeskState {
  switch (action.type) {
    case 'TOGGLE_PLATFORM':
      return {
        ...state,
        filters: {
          ...state.filters,
          platforms: toggleSetMember(state.filters.platforms, action.platform),
        },
      };
    case 'SET_PLATFORMS':
      return {
        ...state,
        filters: { ...state.filters, platforms: action.platforms },
      };
    case 'SET_SOURCE':
      return {
        ...state,
        filters: { ...state.filters, source: action.source },
      };
    case 'SET_CONTENT_TYPE':
      return {
        ...state,
        filters: { ...state.filters, contentType: action.contentType },
      };
    case 'SET_SORT':
      return { ...state, sort: action.sort };
    case 'SET_SEARCH':
      return {
        ...state,
        filters: { ...state.filters, search: action.search },
      };
    case 'TOGGLE_SELECT':
      return {
        ...state,
        selection: toggleSetMember(state.selection, action.key),
      };
    case 'SELECT_ALL_VISIBLE':
      return { ...state, selection: new Set(action.keys) };
    case 'CLEAR_SELECTION':
      return { ...state, selection: new Set() };
    case 'MOVE_CURSOR':
      return {
        ...state,
        cursorKey: moveCursor(
          state.cursorKey,
          action.direction,
          action.visibleKeys,
        ),
      };
    case 'SET_CURSOR':
      return { ...state, cursorKey: action.key };
    default:
      return state;
  }
}

function matchesSearch(item: DiscoveryDeskItem, search: string): boolean {
  if (!search) {
    return true;
  }

  const needle = search.toLowerCase();
  return [item.title, item.text, item.authorHandle, item.trendTopic].some(
    (value) => value?.toLowerCase().includes(needle),
  );
}

function compareBySort(
  a: DiscoveryDeskItem,
  b: DiscoveryDeskItem,
  sort: DiscoveryDeskSort,
): number {
  switch (sort) {
    case 'virality':
      return b.virality - a.virality;
    case 'engagement':
      return b.engagement - a.engagement;
    case 'recency': {
      const aTime = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const bTime = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return bTime - aTime;
    }
    default:
      return b.velocity - a.velocity;
  }
}

export function selectVisibleItems(
  items: DiscoveryDeskItem[],
  state: DiscoveryDeskState,
): DiscoveryDeskItem[] {
  const { contentType, platforms, search, source } = state.filters;

  const filtered = items.filter((item) => {
    if (platforms.size > 0 && !platforms.has(item.platform)) {
      return false;
    }
    if (source !== 'all' && item.source !== source) {
      return false;
    }
    if (contentType !== 'all' && item.contentType !== contentType) {
      return false;
    }
    return matchesSearch(item, search);
  });

  return filtered.slice().sort((a, b) => compareBySort(a, b, state.sort));
}
