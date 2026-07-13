import type { AttachmentItem } from '@genfeedai/props/ui/attachments.props';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAttachments } from './use-attachments';

function completedAttachment(id: string): AttachmentItem {
  return {
    id,
    ingredientId: `${id}-ingredient`,
    kind: 'image',
    name: `${id}.png`,
    previewUrl: `https://cdn.example/${id}.png`,
    status: 'completed',
    url: `https://cdn.example/${id}.png`,
  };
}

describe('useAttachments initial attachment synchronization', () => {
  it('does not write the previous scope attachments into a new scope', async () => {
    const firstScopeAttachments = [completedAttachment('first')];
    const secondScopeAttachments = [completedAttachment('second')];
    const onAttachmentsChange = vi.fn();
    const onUpload = vi.fn();
    const { rerender } = renderHook(
      ({ initialAttachments }) =>
        useAttachments({
          initialAttachments,
          onAttachmentsChange,
          onUpload,
        }),
      { initialProps: { initialAttachments: firstScopeAttachments } },
    );

    await waitFor(() => {
      expect(onAttachmentsChange).toHaveBeenLastCalledWith(
        firstScopeAttachments,
      );
    });
    onAttachmentsChange.mockClear();

    rerender({ initialAttachments: secondScopeAttachments });

    await waitFor(() => {
      expect(onAttachmentsChange).toHaveBeenLastCalledWith(
        secondScopeAttachments,
      );
    });
    expect(onAttachmentsChange).not.toHaveBeenCalledWith(firstScopeAttachments);
  });
});
