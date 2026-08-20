import { act, renderHook } from '@testing-library/react';
import {
  MAX_RECENT_MODEL_KEYS,
  MODEL_RECENTS_STORAGE_KEY,
  readStoredRecentModelKeys,
  useModelRecents,
} from '@ui/dropdowns/model-selector/useModelRecents';
import { beforeEach, describe, expect, it } from 'vitest';

function storedKeys(): string[] {
  return JSON.parse(
    window.localStorage.getItem(MODEL_RECENTS_STORAGE_KEY) ?? '[]',
  );
}

describe('useModelRecents', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('starts from what the device already remembers', () => {
    window.localStorage.setItem(
      MODEL_RECENTS_STORAGE_KEY,
      JSON.stringify(['google/veo-3', 'openai/sora']),
    );

    const { result } = renderHook(() => useModelRecents());

    expect(result.current.recentModelKeys).toEqual([
      'google/veo-3',
      'openai/sora',
    ]);
  });

  it('moves a re-used model back to the front instead of duplicating it', () => {
    const { result } = renderHook(() => useModelRecents());

    act(() => result.current.onModelUsed('google/veo-3'));
    act(() => result.current.onModelUsed('openai/sora'));
    act(() => result.current.onModelUsed('google/veo-3'));

    expect(result.current.recentModelKeys).toEqual([
      'google/veo-3',
      'openai/sora',
    ]);
    expect(storedKeys()).toEqual(['google/veo-3', 'openai/sora']);
  });

  it('keeps the recent lane short enough to stay a shortcut', () => {
    const { result } = renderHook(() => useModelRecents());

    for (let index = 0; index < MAX_RECENT_MODEL_KEYS + 3; index += 1) {
      act(() => result.current.onModelUsed(`google/model-${index}`));
    }

    expect(result.current.recentModelKeys).toHaveLength(MAX_RECENT_MODEL_KEYS);
    expect(result.current.recentModelKeys[0]).toBe(
      `google/model-${MAX_RECENT_MODEL_KEYS + 2}`,
    );
  });

  it('ignores stored values that are not a list of keys', () => {
    window.localStorage.setItem(MODEL_RECENTS_STORAGE_KEY, '{"nope":true}');
    expect(readStoredRecentModelKeys()).toEqual([]);

    window.localStorage.setItem(MODEL_RECENTS_STORAGE_KEY, 'not json');
    expect(readStoredRecentModelKeys()).toEqual([]);

    window.localStorage.setItem(
      MODEL_RECENTS_STORAGE_KEY,
      JSON.stringify(['google/veo-3', 42, null]),
    );
    expect(readStoredRecentModelKeys()).toEqual(['google/veo-3']);
  });
});
