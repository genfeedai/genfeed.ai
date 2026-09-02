import { UploadStatus } from '@genfeedai/contracts';
import type { AttachmentItem } from '@genfeedai/props/ui/attachments.props';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { DragEvent } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAttachments } from './use-attachments';

function completedAttachment(id: string): AttachmentItem {
  return {
    id,
    ingredientId: `${id}-ingredient`,
    kind: 'image',
    name: `${id}.png`,
    previewUrl: `https://cdn.example/${id}.png`,
    status: UploadStatus.COMPLETED,
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

function createFile(name: string, type: string, sizeBytes = 1024): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: sizeBytes });
  return file;
}

function createDragEvent(options: {
  isFileDrag?: boolean;
  files?: File[];
}): DragEvent<HTMLDivElement> {
  const { files = [], isFileDrag = true } = options;
  return {
    dataTransfer: {
      files,
      types: isFileDrag ? ['Files'] : ['text/plain'],
    },
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as DragEvent<HTMLDivElement>;
}

describe('useAttachments', () => {
  const mockOnUpload = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn(() => `blob:${Math.random()}`);
    URL.revokeObjectURL = vi.fn();
    mockOnUpload.mockResolvedValue({
      ingredientId: 'ingredient-1',
      url: 'https://cdn.example/uploaded.png',
    });
  });

  it('uploads accepted files and marks them completed', async () => {
    const { result } = renderHook(() =>
      useAttachments({ onUpload: mockOnUpload }),
    );

    act(() => {
      result.current.addFiles([createFile('photo.png', 'image/png')]);
    });

    await waitFor(() => {
      expect(result.current.attachments[0]?.status).toBe(
        UploadStatus.COMPLETED,
      );
    });

    expect(mockOnUpload).toHaveBeenCalledTimes(1);
    const attachment = result.current.attachments[0];
    expect(attachment.ingredientId).toBe('ingredient-1');
    expect(attachment.url).toBe('https://cdn.example/uploaded.png');
    expect(attachment.progress).toBe(100);
    expect(attachment.kind).toBe('image');
    expect(result.current.isUploading).toBe(false);
  });

  it('reports upload progress through the callback', async () => {
    let reportProgress: ((pct: number) => void) | undefined;
    let resolveUpload:
      | ((value: { ingredientId: string; url: string }) => void)
      | undefined;
    mockOnUpload.mockImplementation(
      (_file: File, onProgress: (pct: number) => void) => {
        reportProgress = onProgress;
        return new Promise((resolve) => {
          resolveUpload = resolve;
        });
      },
    );

    const { result } = renderHook(() =>
      useAttachments({ onUpload: mockOnUpload }),
    );

    act(() => {
      result.current.addFiles([createFile('photo.png', 'image/png')]);
    });

    await waitFor(() => {
      expect(mockOnUpload).toHaveBeenCalledTimes(1);
    });
    expect(result.current.isUploading).toBe(true);

    act(() => {
      reportProgress?.(42);
    });
    expect(result.current.attachments[0].progress).toBe(42);

    await act(async () => {
      resolveUpload?.({ ingredientId: 'ing', url: 'https://cdn/u.png' });
    });
    await waitFor(() => {
      expect(result.current.attachments[0].status).toBe(UploadStatus.COMPLETED);
    });
  });

  it('marks failed uploads with the error message', async () => {
    mockOnUpload.mockRejectedValue(new Error('upload exploded'));

    const { result } = renderHook(() =>
      useAttachments({ onUpload: mockOnUpload }),
    );

    act(() => {
      result.current.addFiles([createFile('photo.png', 'image/png')]);
    });

    await waitFor(() => {
      expect(result.current.attachments[0]?.status).toBe(UploadStatus.FAILED);
    });
    expect(result.current.attachments[0].error).toBe('upload exploded');
  });

  it('filters files by accepted type and size', () => {
    const { result } = renderHook(() =>
      useAttachments({ maxFileSizeMb: 1, onUpload: mockOnUpload }),
    );

    act(() => {
      result.current.addFiles([
        createFile('doc.pdf', 'application/pdf'),
        createFile('huge.png', 'image/png', 5 * 1024 * 1024),
        createFile('ok.png', 'image/png'),
      ]);
    });

    expect(result.current.attachments).toHaveLength(1);
    expect(result.current.attachments[0].name).toBe('ok.png');
  });

  it('honors exact accepted types and infers video/audio kinds', () => {
    const { result } = renderHook(() =>
      useAttachments({
        acceptedTypes: ['video/mp4', 'audio/*'],
        onUpload: mockOnUpload,
      }),
    );

    act(() => {
      result.current.addFiles([
        createFile('clip.mp4', 'video/mp4'),
        createFile('voice.mp3', 'audio/mpeg'),
        createFile('photo.png', 'image/png'),
      ]);
    });

    expect(result.current.attachments.map((a) => a.kind)).toEqual([
      'video',
      'audio',
    ]);
  });

  it('caps additions at maxFiles', () => {
    const { result } = renderHook(() =>
      useAttachments({ maxFiles: 2, onUpload: mockOnUpload }),
    );

    act(() => {
      result.current.addFiles([
        createFile('one.png', 'image/png'),
        createFile('two.png', 'image/png'),
        createFile('three.png', 'image/png'),
      ]);
    });

    expect(result.current.attachments).toHaveLength(2);

    act(() => {
      result.current.addFiles([createFile('four.png', 'image/png')]);
    });
    expect(result.current.attachments).toHaveLength(2);
  });

  it('removes an attachment and revokes its preview url', async () => {
    const { result } = renderHook(() =>
      useAttachments({ onUpload: mockOnUpload }),
    );

    act(() => {
      result.current.addFiles([createFile('photo.png', 'image/png')]);
    });

    await waitFor(() => {
      expect(result.current.attachments).toHaveLength(1);
    });
    const attachmentId = result.current.attachments[0].id;

    act(() => {
      result.current.removeAttachment(attachmentId);
    });

    expect(result.current.attachments).toHaveLength(0);
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it('clears all attachments', async () => {
    const { result } = renderHook(() =>
      useAttachments({ onUpload: mockOnUpload }),
    );

    act(() => {
      result.current.addFiles([
        createFile('one.png', 'image/png'),
        createFile('two.png', 'image/png'),
      ]);
    });

    await waitFor(() => {
      expect(result.current.attachments).toHaveLength(2);
    });

    act(() => {
      result.current.clearAll();
    });

    expect(result.current.attachments).toHaveLength(0);
  });

  it('returns only completed attachments as chat attachments', async () => {
    const { result } = renderHook(() =>
      useAttachments({
        initialAttachments: [
          completedAttachment('done'),
          {
            id: 'pending-1',
            kind: 'image',
            name: 'pending.png',
            previewUrl: 'blob:pending',
            status: UploadStatus.PENDING,
          } as AttachmentItem,
        ],
        onUpload: mockOnUpload,
      }),
    );

    expect(result.current.getCompletedAttachments()).toEqual([
      {
        ingredientId: 'done-ingredient',
        kind: 'image',
        name: 'done.png',
        url: 'https://cdn.example/done.png',
      },
    ]);
    expect(result.current.isUploading).toBe(true);
  });

  it('tracks drag state across enter, leave, and drop', async () => {
    const { result } = renderHook(() =>
      useAttachments({ onUpload: mockOnUpload }),
    );

    act(() => {
      result.current.dragHandlers.onDragEnter(createDragEvent({}));
      result.current.dragHandlers.onDragEnter(createDragEvent({}));
    });
    expect(result.current.dragState.isActive).toBe(true);

    act(() => {
      result.current.dragHandlers.onDragLeave(createDragEvent({}));
    });
    expect(result.current.dragState.isActive).toBe(true);

    act(() => {
      result.current.dragHandlers.onDragLeave(createDragEvent({}));
    });
    expect(result.current.dragState.isActive).toBe(false);

    const overEvent = createDragEvent({});
    act(() => {
      result.current.dragHandlers.onDragOver(overEvent);
    });
    expect(overEvent.preventDefault).toHaveBeenCalled();

    act(() => {
      result.current.dragHandlers.onDrop(
        createDragEvent({ files: [createFile('drop.png', 'image/png')] }),
      );
    });

    await waitFor(() => {
      expect(result.current.attachments).toHaveLength(1);
    });
    expect(result.current.dragState.isActive).toBe(false);
  });

  it('ignores non-file drags', () => {
    const { result } = renderHook(() =>
      useAttachments({ onUpload: mockOnUpload }),
    );

    act(() => {
      result.current.dragHandlers.onDragEnter(
        createDragEvent({ isFileDrag: false }),
      );
    });
    expect(result.current.dragState.isActive).toBe(false);

    act(() => {
      result.current.dragHandlers.onDragLeave(
        createDragEvent({ isFileDrag: false }),
      );
    });
    expect(result.current.dragState.isActive).toBe(false);
  });

  it('revokes preview urls on unmount', async () => {
    const { result, unmount } = renderHook(() =>
      useAttachments({ onUpload: mockOnUpload }),
    );

    act(() => {
      result.current.addFiles([createFile('photo.png', 'image/png')]);
    });

    await waitFor(() => {
      expect(result.current.attachments).toHaveLength(1);
    });

    unmount();

    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });
});
