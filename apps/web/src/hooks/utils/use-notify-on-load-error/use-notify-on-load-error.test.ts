import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useNotifyOnLoadError } from './use-notify-on-load-error';

function setup(initial: { errorUpdatedAt: number; hasError: boolean }) {
  const messages: string[] = [];
  const view = renderHook(
    (props: { errorUpdatedAt: number; hasError: boolean }) =>
      useNotifyOnLoadError({
        ...props,
        notify: () => {
          messages.push('failed');
        },
      }),
    { initialProps: initial },
  );

  return { messages, ...view };
}

describe('useNotifyOnLoadError', () => {
  it('does not notify while the read has not failed', () => {
    const { messages } = setup({ errorUpdatedAt: 0, hasError: false });

    expect(messages).toEqual([]);
  });

  it('notifies once for a failed read, not on every re-render', () => {
    const { messages, rerender } = setup({ errorUpdatedAt: 5, hasError: true });

    rerender({ errorUpdatedAt: 5, hasError: true });
    rerender({ errorUpdatedAt: 5, hasError: true });

    expect(messages).toEqual(['failed']);
  });

  it('notifies again for the next failed read', () => {
    const { messages, rerender } = setup({ errorUpdatedAt: 5, hasError: true });

    rerender({ errorUpdatedAt: 9, hasError: true });

    expect(messages).toEqual(['failed', 'failed']);
  });
});
