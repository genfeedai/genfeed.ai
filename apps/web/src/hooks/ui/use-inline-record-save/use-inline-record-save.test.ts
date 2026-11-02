import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useInlineRecordSave } from './use-inline-record-save';

const mocks = vi.hoisted(() => ({
  shownErrors: [] as string[],
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: () => undefined },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: (message: string) => {
        mocks.shownErrors.push(message);
      },
    }),
  },
}));

describe('useInlineRecordSave', () => {
  beforeEach(() => {
    mocks.shownErrors.length = 0;
  });

  it('sends the partial update, then reloads the list', async () => {
    const events: string[] = [];
    const { result } = renderHook(() =>
      useInlineRecordSave<{ label: string }>({
        errorMessage: 'Failed to update',
        onSaved: async () => {
          events.push('reload');
        },
        save: async (id, patch) => {
          events.push(`save ${id} ${patch.label}`);
        },
      }),
    );

    await result.current('record-1', { label: 'New' });

    expect(events).toEqual(['save record-1 New', 'reload']);
    expect(mocks.shownErrors).toEqual([]);
  });

  it('notifies and rethrows a failed save without reloading the list', async () => {
    const events: string[] = [];
    const { result } = renderHook(() =>
      useInlineRecordSave<{ label: string }>({
        errorMessage: 'Failed to update tag',
        onSaved: () => {
          events.push('reload');
        },
        save: async () => {
          throw new Error('nope');
        },
      }),
    );

    await expect(result.current('record-1', { label: 'X' })).rejects.toThrow(
      'nope',
    );

    expect(mocks.shownErrors).toEqual(['Failed to update tag']);
    expect(events).toEqual([]);
  });

  it('keeps the same callback while using the latest options', async () => {
    const events: string[] = [];
    let label = 'first';
    const { result, rerender } = renderHook(() =>
      useInlineRecordSave<{ label: string }>({
        errorMessage: 'Failed',
        onSaved: () => undefined,
        save: async (id) => {
          events.push(`${label} ${id}`);
        },
      }),
    );
    const first = result.current;

    label = 'second';
    rerender();
    await result.current('record-2', { label: 'Y' });

    expect(result.current).toBe(first);
    expect(events).toEqual(['second record-2']);
  });
});
