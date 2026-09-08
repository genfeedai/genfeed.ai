import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCharacterMentions } from './use-character-mentions';

describe('character mention refresh', () => {
  it('offers a newly saved character without remounting the prompt bar', async () => {
    const getCharacterMentions = vi.fn().mockResolvedValue([]);
    const api = { getCharacterMentions } as unknown as AgentApiService;
    const { result, unmount } = renderHook(() => useCharacterMentions(api));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    getCharacterMentions.mockResolvedValue([
      { id: 'char-1', handle: 'anna', avatarIngredientId: 'image-1' },
    ]);
    act(() => window.dispatchEvent(new Event('genfeed:characters:changed')));
    await waitFor(() =>
      expect(result.current.mentions).toEqual([
        expect.objectContaining({ handle: 'anna' }),
      ]),
    );
    unmount();
    act(() => window.dispatchEvent(new Event('genfeed:characters:changed')));
    expect(getCharacterMentions).toHaveBeenCalledTimes(2);
  });
});
