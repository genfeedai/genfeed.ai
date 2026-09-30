import type { DiscoveryDeskItem } from '@props/trends/discovery-desk.props';
import { describe, expect, it } from 'vitest';
import {
  createInitialDeskState,
  type DiscoveryDeskState,
  discoveryDeskReducer,
  selectVisibleItems,
} from './desk-state';

function makeItem(
  overrides: Partial<DiscoveryDeskItem> = {},
): DiscoveryDeskItem {
  return {
    contentType: 'post',
    engagement: 0,
    key: 'trend:1',
    kind: 'trend',
    id: '1',
    matchedTrends: [],
    metrics: {},
    platform: 'twitter',
    raw: {
      kind: 'trend',
      item: {} as never,
    },
    remixSelector: null,
    source: 'trends',
    velocity: 0,
    virality: 0,
    ...overrides,
  };
}

describe('discoveryDeskReducer', () => {
  it('creates the expected initial state', () => {
    const state = createInitialDeskState();

    expect(state.filters).toEqual({
      contentType: 'all',
      platforms: new Set(),
      search: '',
      source: 'all',
    });
    expect(state.sort).toBe('velocity');
    expect(state.selection.size).toBe(0);
    expect(state.cursorKey).toBeNull();
  });

  it('toggles a platform filter on and off', () => {
    const initial = createInitialDeskState();

    const withPlatform = discoveryDeskReducer(initial, {
      platform: 'tiktok',
      type: 'TOGGLE_PLATFORM',
    });
    expect(withPlatform.filters.platforms.has('tiktok')).toBe(true);

    const withoutPlatform = discoveryDeskReducer(withPlatform, {
      platform: 'tiktok',
      type: 'TOGGLE_PLATFORM',
    });
    expect(withoutPlatform.filters.platforms.has('tiktok')).toBe(false);
  });

  it('does not mutate the previous filters.platforms set', () => {
    const initial = createInitialDeskState();
    const originalPlatforms = initial.filters.platforms;

    discoveryDeskReducer(initial, {
      platform: 'tiktok',
      type: 'TOGGLE_PLATFORM',
    });

    expect(originalPlatforms.has('tiktok')).toBe(false);
  });

  it('sets source, content type, sort, and search', () => {
    let state = createInitialDeskState();
    state = discoveryDeskReducer(state, {
      source: 'following',
      type: 'SET_SOURCE',
    });
    state = discoveryDeskReducer(state, {
      contentType: 'video',
      type: 'SET_CONTENT_TYPE',
    });
    state = discoveryDeskReducer(state, {
      sort: 'engagement',
      type: 'SET_SORT',
    });
    state = discoveryDeskReducer(state, {
      search: 'agents',
      type: 'SET_SEARCH',
    });

    expect(state.filters.source).toBe('following');
    expect(state.filters.contentType).toBe('video');
    expect(state.sort).toBe('engagement');
    expect(state.filters.search).toBe('agents');
  });

  it('toggles selection membership and select-all / clear', () => {
    let state = createInitialDeskState();
    state = discoveryDeskReducer(state, {
      key: 'trend:1',
      type: 'TOGGLE_SELECT',
    });
    expect(state.selection.has('trend:1')).toBe(true);

    state = discoveryDeskReducer(state, {
      keys: ['trend:1', 'trend:2'],
      type: 'SELECT_ALL_VISIBLE',
    });
    expect(state.selection).toEqual(new Set(['trend:1', 'trend:2']));

    state = discoveryDeskReducer(state, { type: 'CLEAR_SELECTION' });
    expect(state.selection.size).toBe(0);
  });

  it('sets the cursor directly', () => {
    const state = discoveryDeskReducer(createInitialDeskState(), {
      key: 'trend:1',
      type: 'SET_CURSOR',
    });
    expect(state.cursorKey).toBe('trend:1');
  });

  describe('MOVE_CURSOR', () => {
    const visibleKeys = ['trend:1', 'trend:2', 'trend:3'];

    it('moves to the first item when no cursor is set and direction is +1', () => {
      const state = discoveryDeskReducer(createInitialDeskState(), {
        direction: 1,
        type: 'MOVE_CURSOR',
        visibleKeys,
      });
      expect(state.cursorKey).toBe('trend:1');
    });

    it('moves to the last item when no cursor is set and direction is -1', () => {
      const state = discoveryDeskReducer(createInitialDeskState(), {
        direction: -1,
        type: 'MOVE_CURSOR',
        visibleKeys,
      });
      expect(state.cursorKey).toBe('trend:3');
    });

    it('advances forward and clamps at the last item', () => {
      let state: DiscoveryDeskState = {
        ...createInitialDeskState(),
        cursorKey: 'trend:3',
      };
      state = discoveryDeskReducer(state, {
        direction: 1,
        type: 'MOVE_CURSOR',
        visibleKeys,
      });
      expect(state.cursorKey).toBe('trend:3');
    });

    it('moves backward and clamps at the first item', () => {
      let state: DiscoveryDeskState = {
        ...createInitialDeskState(),
        cursorKey: 'trend:1',
      };
      state = discoveryDeskReducer(state, {
        direction: -1,
        type: 'MOVE_CURSOR',
        visibleKeys,
      });
      expect(state.cursorKey).toBe('trend:1');
    });

    it('returns null when there are no visible items', () => {
      const state = discoveryDeskReducer(createInitialDeskState(), {
        direction: 1,
        type: 'MOVE_CURSOR',
        visibleKeys: [],
      });
      expect(state.cursorKey).toBeNull();
    });
  });
});

describe('selectVisibleItems', () => {
  const items = [
    makeItem({
      contentType: 'tweet' as never,
      engagement: 50,
      key: 'trend:1',
      platform: 'twitter',
      publishedAt: '2026-08-01T00:00:00.000Z',
      source: 'trends',
      title: 'AI agents everywhere',
      velocity: 10,
      virality: 90,
    }),
    makeItem({
      contentType: 'video',
      engagement: 200,
      key: 'source_post:2',
      kind: 'source_post',
      platform: 'tiktok',
      publishedAt: '2026-08-03T00:00:00.000Z',
      source: 'following',
      title: 'Short form explainer',
      velocity: 40,
      virality: 0,
    }),
    makeItem({
      contentType: 'post',
      engagement: 20,
      key: 'trend:3',
      platform: 'instagram',
      publishedAt: undefined,
      source: 'owned',
      title: 'Brand carousel',
      velocity: 5,
      virality: 30,
    }),
  ];

  it('returns every item, sorted by velocity by default', () => {
    const state = createInitialDeskState();
    const result = selectVisibleItems(items, state);

    expect(result.map((item) => item.key)).toEqual([
      'source_post:2',
      'trend:1',
      'trend:3',
    ]);
  });

  it('filters by platform', () => {
    const state: DiscoveryDeskState = {
      ...createInitialDeskState(),
      filters: {
        ...createInitialDeskState().filters,
        platforms: new Set(['tiktok']),
      },
    };

    expect(selectVisibleItems(items, state).map((item) => item.key)).toEqual([
      'source_post:2',
    ]);
  });

  it('filters by source', () => {
    const state: DiscoveryDeskState = {
      ...createInitialDeskState(),
      filters: { ...createInitialDeskState().filters, source: 'owned' },
    };

    expect(selectVisibleItems(items, state).map((item) => item.key)).toEqual([
      'trend:3',
    ]);
  });

  it('filters by content type', () => {
    const state: DiscoveryDeskState = {
      ...createInitialDeskState(),
      filters: { ...createInitialDeskState().filters, contentType: 'video' },
    };

    expect(selectVisibleItems(items, state).map((item) => item.key)).toEqual([
      'source_post:2',
    ]);
  });

  it('filters by case-insensitive search across title, text, author, and trend topic', () => {
    const state: DiscoveryDeskState = {
      ...createInitialDeskState(),
      filters: { ...createInitialDeskState().filters, search: 'brand' },
    };

    expect(selectVisibleItems(items, state).map((item) => item.key)).toEqual([
      'trend:3',
    ]);
  });

  it('sorts by virality', () => {
    const state: DiscoveryDeskState = {
      ...createInitialDeskState(),
      sort: 'virality',
    };

    expect(selectVisibleItems(items, state).map((item) => item.key)).toEqual([
      'trend:1',
      'trend:3',
      'source_post:2',
    ]);
  });

  it('sorts by engagement', () => {
    const state: DiscoveryDeskState = {
      ...createInitialDeskState(),
      sort: 'engagement',
    };

    expect(selectVisibleItems(items, state).map((item) => item.key)).toEqual([
      'source_post:2',
      'trend:1',
      'trend:3',
    ]);
  });

  it('sorts by recency, pushing items with no publishedAt last', () => {
    const state: DiscoveryDeskState = {
      ...createInitialDeskState(),
      sort: 'recency',
    };

    expect(selectVisibleItems(items, state).map((item) => item.key)).toEqual([
      'source_post:2',
      'trend:1',
      'trend:3',
    ]);
  });

  it('does not mutate the input array', () => {
    const original = [...items];
    selectVisibleItems(items, {
      ...createInitialDeskState(),
      sort: 'engagement',
    });

    expect(items).toEqual(original);
  });
});
