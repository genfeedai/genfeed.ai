import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useModalTrainingNew } from '@/components/modals/trainings/useModalTrainingNew';

interface DropzoneOptions {
  onDrop: (files: File[]) => void;
}

const mocks = vi.hoisted(() => ({
  confirmUpload: vi.fn(),
  dropzone: { onDrop: (_files: File[]) => {} },
  getPresignedUploadUrl: vi.fn(),
  post: vi.fn(),
  uploadDirectToS3: vi.fn(),
}));

vi.mock('@genfeedai/helpers/ui/modal/modal.helper', () => ({
  closeModal: vi.fn(),
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => {
    const service = String(factory).includes('Trainings')
      ? { createIdempotent: mocks.post }
      : {
          confirmUpload: mocks.confirmUpload,
          getPresignedUploadUrl: mocks.getPresignedUploadUrl,
          uploadDirectToS3: mocks.uploadDirectToS3,
        };
    return () => Promise.resolve(service);
  },
}));

vi.mock('@genfeedai/services/ai/trainings.service', () => ({
  TrainingsService: { getInstance: () => 'Trainings' },
}));

vi.mock('@genfeedai/services/ingredients/images.service', () => ({
  ImagesService: { getInstance: () => 'Images' },
}));

vi.mock('@genfeedai/services/core/socket.service', () => ({
  SocketService: { getInstance: () => ({ socket: null }) },
}));

vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ error: vi.fn(), info: vi.fn(), success: vi.fn() }),
  },
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/hooks/ui/use-focus-first-input/use-focus-first-input', () => ({
  useFocusFirstInput: () => ({ current: null }),
}));

vi.mock('react-dropzone', () => ({
  useDropzone: (options: DropzoneOptions) => {
    mocks.dropzone.onDrop = options.onDrop;
    return {
      getInputProps: () => ({}),
      getRootProps: () => ({}),
      isDragActive: false,
    };
  },
}));

vi.mock('next/navigation', () => ({ usePathname: () => '/models' }));

const wrapper = ({ children }: { children: ReactNode }) => <>{children}</>;

function buildFiles(count: number): File[] {
  return Array.from(
    { length: count },
    (_, index) => new File(['x'], `img-${index}.png`, { type: 'image/png' }),
  );
}

async function renderReadyHook() {
  const rendered = renderHook(() => useModalTrainingNew({}), { wrapper });

  act(() => {
    mocks.dropzone.onDrop(buildFiles(10));
  });
  act(() => {
    rendered.result.current.form.setValue('label', 'My model');
    rendered.result.current.form.setValue('trigger', 'ABC123');
    rendered.result.current.form.setValue('description', 'A subject');
  });

  return rendered;
}

const submitEvent = () => ({ preventDefault: vi.fn() });

describe('useModalTrainingNew submit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let counter = 0;
    mocks.getPresignedUploadUrl.mockImplementation(async () => ({
      id: `presigned-${++counter}`,
      s3Key: 'key',
      uploadUrl: 'https://upload.test',
    }));
    mocks.uploadDirectToS3.mockResolvedValue(undefined);
    mocks.confirmUpload.mockImplementation(async (id: string) => ({
      id: `image-${id}`,
    }));
  });

  it('does not upload completed files again when a retry follows a failed create', async () => {
    mocks.post
      .mockRejectedValueOnce({ isNetworkError: true })
      .mockResolvedValueOnce({ id: 'training-1' });

    const { result } = await renderReadyHook();

    await act(async () => {
      await result.current.onSubmit(submitEvent());
    });
    expect(mocks.uploadDirectToS3.mock.calls).toHaveLength(10);
    expect(result.current.error).toBe(
      'Network error. Please check your connection.',
    );

    await act(async () => {
      await result.current.onSubmit(submitEvent());
    });

    expect(mocks.uploadDirectToS3.mock.calls).toHaveLength(10);
    const firstSources = mocks.post.mock.calls[0][0].sources;
    expect(mocks.post.mock.calls[1][0].sources).toEqual(firstSources);
    expect(firstSources).toHaveLength(10);
  });

  it('sends the same idempotency key when a retry follows a failed create', async () => {
    mocks.post
      .mockRejectedValueOnce({ isTimeout: true })
      .mockResolvedValueOnce({ id: 'training-1' });

    const { result } = await renderReadyHook();

    await act(async () => {
      await result.current.onSubmit(submitEvent());
    });
    await act(async () => {
      await result.current.onSubmit(submitEvent());
    });

    const [firstKey, retryKey] = mocks.post.mock.calls.map((call) => call[1]);
    expect(firstKey).toEqual(expect.any(String));
    expect(retryKey).toBe(firstKey);
  });

  it('uploads only the files that failed on the previous attempt', async () => {
    mocks.uploadDirectToS3.mockRejectedValueOnce(new Error('boom'));
    mocks.post.mockResolvedValue({ id: 'training-1' });

    const { result } = await renderReadyHook();

    await act(async () => {
      await result.current.onSubmit(submitEvent());
    });
    expect(mocks.post.mock.calls).toHaveLength(0);

    await act(async () => {
      await result.current.onSubmit(submitEvent());
    });

    expect(mocks.uploadDirectToS3.mock.calls).toHaveLength(11);
    expect(mocks.post.mock.calls).toHaveLength(1);
    expect(mocks.post.mock.calls[0][0].sources).toHaveLength(10);
  });

  it('ignores a second submit while the first is in flight', async () => {
    let resolvePost: (value: { id: string }) => void = () => {};
    mocks.post.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePost = resolve;
        }),
    );

    const { result } = await renderReadyHook();

    let first: Promise<void> = Promise.resolve();
    let second: Promise<void> = Promise.resolve();
    await act(async () => {
      first = result.current.onSubmit(submitEvent());
      second = result.current.onSubmit(submitEvent());
      await vi.waitFor(() => expect(mocks.post.mock.calls).toHaveLength(1));
      resolvePost({ id: 'training-1' });
      await Promise.all([first, second]);
    });

    expect(mocks.uploadDirectToS3.mock.calls).toHaveLength(10);
    expect(mocks.post.mock.calls).toHaveLength(1);
  });
});
