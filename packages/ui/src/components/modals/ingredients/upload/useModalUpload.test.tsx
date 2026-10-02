import {
  AssetCategory,
  IngredientCategory,
  UploadStatus,
} from '@genfeedai/contracts';
import { IngredientsService } from '@genfeedai/services/content/ingredients.service';
import { act, cleanup, renderHook } from '@testing-library/react';
import type * as AxiosModule from 'axios';
import type { ChangeEvent, DragEvent } from 'react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest';
import { useModalUpload } from './useModalUpload';

const boundary = vi.hoisted(() => ({
  clearRecordedFile: vi.fn(),
  closeModal: vi.fn(),
  onComplete: vi.fn(),
  assetUpload: vi.fn(),
  cloneVoice: vi.fn(),
  emit: vi.fn(),
  put: vi.fn(),
  post: vi.fn(),
  servicePost: vi.fn(),
  mapOne: vi.fn(),
  presigned: vi.fn(),
  isPresigned: true,
}));
vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ selectedBrand: null, fleetCapabilities: null }),
}));
vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => () =>
    Promise.resolve(factory('test-token')),
}));
vi.mock(
  '@genfeedai/hooks/media/use-audio-recording/use-audio-recording',
  () => ({
    useAudioRecording: () => ({
      clearRecordedFile: boundary.clearRecordedFile,
      isRecording: false,
      isSupported: true,
      recordedFile: null,
      startRecording: vi.fn(),
      stopRecording: vi.fn(),
    }),
  }),
);
vi.mock('@genfeedai/helpers/ui/modal/modal.helper', () => ({
  closeModal: boundary.closeModal,
}));
vi.mock('@genfeedai/services/core/environment.service', () => ({
  EnvironmentService: {
    get USE_PRESIGNED_URLS() {
      return boundary.isPresigned;
    },
  },
}));
vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}));
vi.mock('@genfeedai/services/core/socket.service', () => ({
  SocketService: { getInstance: () => ({ socket: { emit: boundary.emit } }) },
}));
vi.mock('@genfeedai/services/content/assets.service', () => ({
  AssetsService: { getInstance: () => ({ postUpload: boundary.assetUpload }) },
}));
vi.mock('@genfeedai/services/ingredients/voice-clone.service', () => ({
  VoiceCloneService: {
    getInstance: () => ({ cloneVoice: boundary.cloneVoice }),
  },
}));
vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof AxiosModule>();
  return {
    ...actual,
    default: { ...actual.default, put: boundary.put, post: boundary.post },
  };
});

type UploadParams = Parameters<typeof useModalUpload>[0];
type UploadHook = ReturnType<typeof renderUpload>;
const jpegResult = {
  id: 'server-image',
  url: 'https://media.example/final.jpg',
  mimeType: 'image/jpeg',
};
let images: HTMLImageElement[] = [];
let createObjectURL: Mock<typeof URL.createObjectURL>;
let revokeObjectURL: Mock<typeof URL.revokeObjectURL>;

function renderUpload(overrides: Partial<UploadParams> = {}) {
  const props: UploadParams = {
    category: IngredientCategory.IMAGE,
    onComplete: boundary.onComplete,
    formRef: { current: null },
    isOpen: true,
    openKey: 'first',
    width: 100,
    height: 100,
    ...overrides,
  };
  return renderHook((params: UploadParams) => useModalUpload(params), {
    initialProps: props,
  });
}

async function pick(hook: UploadHook, files: File[]) {
  const target = document.createElement('input');
  Object.defineProperty(target, 'files', { value: files });
  const event = new Event('change', { bubbles: true });
  Reflect.set(event, 'persist', () => undefined);
  Object.defineProperty(event, 'target', { value: target });
  await act(async () => {
    hook.result.current
      .getInputProps()
      .onChange?.(event as unknown as ChangeEvent<HTMLInputElement>);
  });
}

async function drop(hook: UploadHook, files: File[]) {
  const event = new Event('drop', { bubbles: true });
  Reflect.set(event, 'persist', () => undefined);
  Object.defineProperty(event, 'dataTransfer', {
    value: {
      files,
      items: files.map((file) => ({
        kind: 'file',
        type: file.type,
        getAsFile: () => file,
      })),
      types: ['Files'],
    },
  });
  await act(async () => {
    hook.result.current
      .getRootProps()
      .onDrop?.(event as unknown as DragEvent<HTMLElement>);
  });
}

function loadImage(image: HTMLImageElement, width = 200, height = 300) {
  Object.defineProperties(image, {
    width: { configurable: true, value: width },
    height: { configurable: true, value: height },
  });
  act(() => image.onload?.(new Event('load')));
}

beforeEach(() => {
  vi.clearAllMocks();
  images = [];
  boundary.isPresigned = true;
  boundary.put.mockResolvedValue({});
  boundary.post.mockResolvedValue({});
  boundary.servicePost.mockResolvedValue({ data: { server: 'response' } });
  boundary.mapOne.mockReturnValue(jpegResult);
  boundary.assetUpload.mockResolvedValue(jpegResult);
  boundary.cloneVoice.mockResolvedValue(jpegResult);
  boundary.presigned.mockResolvedValue({
    id: 'ingress-id',
    uploadUrl: 'https://bucket.s3.amazonaws.com/ingress',
    s3Key: 'ingress-key',
  });
  // Keep the real transport methods, including self-hosted JSON delegation.
  const service = Object.create(
    IngredientsService.prototype,
  ) as IngredientsService;
  Reflect.set(service, 'instance', { post: boundary.servicePost });
  Reflect.set(service, 'mapOne', boundary.mapOne);
  service.getPresignedUploadUrl = boundary.presigned;
  vi.spyOn(IngredientsService, 'getInstance').mockReturnValue(service);
  createObjectURL = vi.fn<typeof URL.createObjectURL>(
    () => `blob:preview-${images.length}`,
  );
  revokeObjectURL = vi.fn<typeof URL.revokeObjectURL>();
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = revokeObjectURL;
    },
  );
  vi.stubGlobal('Image', function Image() {
    const image = document.createElement('img');
    images.push(image);
    return image;
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Library upload intake with real dropzone', () => {
  it.each(['pick', 'drop'])(
    'accepts empty MIME HEIC through %s without browser decoding',
    async (intake) => {
      vi.stubGlobal(
        'Image',
        vi.fn(() => {
          throw new Error('Browser cannot decode HEIC');
        }),
      );
      const hook = renderUpload();
      const file = new File(['original'], 'Phone.HEIC', { lastModified: 987 });
      await (intake === 'pick' ? pick : drop)(hook, [file]);
      expect(hook.result.current.files).toHaveLength(1);
      expect(hook.result.current.files[0]).toMatchObject({
        name: 'Phone.heic',
        type: 'image/heic',
        lastModified: 987,
      });
      expect(Image).not.toHaveBeenCalled();
      expect(createObjectURL).not.toHaveBeenCalled();
      expect(hook.result.current.dimensionWarning).toBeNull();
      expect(hook.result.current.getInputProps().accept).toContain(
        'image/heif',
      );
    },
  );

  it('preserves order and deduplicates within a batch while filling maxFiles', async () => {
    const hook = renderUpload({ maxFiles: 3 });
    await pick(hook, [
      new File(['a'], 'a.HEIC'),
      new File(['duplicate'], 'a.heic'),
      new File(['b'], 'b.HEIF'),
    ]);
    expect(hook.result.current.files.map((file) => file.name)).toEqual([
      'a.heic',
      'b.heif',
    ]);
    expect(hook.result.current.fileStatuses.size).toBe(2);
    await pick(hook, [new File(['c'], 'c.heic'), new File(['d'], 'd.heif')]);
    expect(hook.result.current.files.map((file) => file.name)).toEqual([
      'a.heic',
      'b.heif',
      'c.heic',
    ]);
    expect(hook.result.current.fileStatuses.size).toBe(3);
  });

  it('keeps real dropzone over-limit batch rejection visible', async () => {
    const hook = renderUpload({ maxFiles: 2 });
    await pick(hook, [
      new File(['a'], 'a.heic'),
      new File(['b'], 'b.heic'),
      new File(['c'], 'c.heic'),
    ]);
    expect(hook.result.current.files).toHaveLength(0);
    expect(hook.result.current.error).toContain('rejected');
  });

  it.each([
    [IngredientCategory.IMAGE, 'image/jpeg', 'jpg'],
    [IngredientCategory.IMAGE, 'image/png', 'png'],
    [IngredientCategory.IMAGE, 'image/webp', 'webp'],
    [IngredientCategory.IMAGE, 'image/gif', 'gif'],
    [IngredientCategory.AUDIO, 'audio/mpeg', 'mp3'],
    [IngredientCategory.VIDEO, 'video/mp4', 'mp4'],
  ])('keeps ordinary %s %s intake', async (category, type, extension) => {
    const hook = renderUpload({ category });
    await pick(hook, [new File(['bytes'], `media.${extension}`, { type })]);
    expect(hook.result.current.files).toHaveLength(1);
    expect(hook.result.current.files[0].type).toBe(type);
  });

  it.each([
    AssetCategory.BANNER,
    AssetCategory.LOGO,
    AssetCategory.REFERENCE,
    IngredientCategory.AUDIO,
    IngredientCategory.VIDEO,
    IngredientCategory.VOICE,
  ])('does not broaden empty MIME HEIC acceptance for %s', async (category) => {
    const hook = renderUpload({ category });
    await pick(hook, [new File(['bytes'], 'phone.heic')]);
    expect(hook.result.current.files).toHaveLength(0);
    expect(hook.result.current.error).toContain('rejected');
    expect(hook.result.current.acceptedTypes).not.toContain('.heic');
  });
});

describe('optional image recommendation lifecycle', () => {
  it('enqueues before load and reports measured dimensions with cleanup', async () => {
    const hook = renderUpload();
    await pick(hook, [
      new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' }),
    ]);
    expect(hook.result.current.files).toHaveLength(1);
    expect(
      Array.from(hook.result.current.fileStatuses.values())[0].status,
    ).toBe(UploadStatus.PENDING);
    loadImage(images[0]);
    expect(hook.result.current.dimensionWarning).toContain('200x300px');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-1');
    expect(images[0].onload).toBeNull();
    expect(images[0].onerror).toBeNull();
  });

  it('clears the recommendation for matching dimensions and disposes handlers and timer', async () => {
    vi.useFakeTimers();
    const hook = renderUpload();
    await pick(hook, [
      new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' }),
    ]);
    loadImage(images[0], 100, 100);
    expect(hook.result.current.dimensionWarning).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(images[0].onload).toBeNull();
    expect(images[0].onerror).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears a stale warning on HEIC without inventing dimensions', async () => {
    const hook = renderUpload();
    await pick(hook, [
      new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' }),
    ]);
    loadImage(images[0]);
    await pick(hook, [new File(['bytes'], 'phone.heif')]);
    expect(hook.result.current.dimensionWarning).toBeNull();
    expect(images).toHaveLength(1);
  });

  it('settles an error without removing or requeueing the image', async () => {
    const hook = renderUpload();
    await pick(hook, [new File(['bytes'], 'photo.png', { type: 'image/png' })]);
    act(() => images[0].onerror?.(new Event('error')));
    expect(hook.result.current.files).toHaveLength(1);
    expect(hook.result.current.dimensionWarning).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(images[0].onload).toBeNull();
  });

  it('settles a never-firing preview after five seconds and clears its timer', async () => {
    vi.useFakeTimers();
    const hook = renderUpload();
    await pick(hook, [
      new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' }),
    ]);
    act(() => vi.advanceTimersByTime(4_999));
    expect(revokeObjectURL).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(images[0].onload).toBeNull();
    expect(hook.result.current.files).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['Image', 'object URL', 'src'])(
    'contains synchronous %s setup failure after immediate enqueue',
    async (failure) => {
      if (failure === 'Image')
        vi.stubGlobal(
          'Image',
          vi.fn(() => {
            throw new Error('unavailable');
          }),
        );
      if (failure === 'object URL')
        createObjectURL.mockImplementation(() => {
          throw new Error('unavailable');
        });
      if (failure === 'src')
        vi.stubGlobal('Image', function Image() {
          const image = document.createElement('img');
          Object.defineProperty(image, 'src', {
            set() {
              throw new Error('unavailable');
            },
          });
          images.push(image);
          return image;
        });
      const hook = renderUpload();
      await pick(hook, [
        new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' }),
      ]);
      expect(hook.result.current.files).toHaveLength(1);
      expect(hook.result.current.error).toBeNull();
      expect(hook.result.current.dimensionWarning).toBeNull();
      if (failure === 'src') expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['openKey', 'isOpen', 'close', 'unmount'])(
    'fences late probe callbacks on %s',
    async (change) => {
      vi.useFakeTimers();
      const hook = renderUpload();
      await pick(hook, [
        new File(['bytes'], 'old.jpg', { type: 'image/jpeg' }),
      ]);
      const lateLoad = images[0].onload;
      if (change === 'openKey' || change === 'isOpen')
        hook.rerender({
          category: IngredientCategory.IMAGE,
          onComplete: boundary.onComplete,
          formRef: { current: null },
          width: 100,
          isOpen: change !== 'isOpen',
          openKey: change === 'openKey' ? 'next' : 'first',
        });
      if (change === 'close') act(() => hook.result.current.closeModalUpload());
      if (change === 'unmount') hook.unmount();
      act(() => lateLoad?.call(images[0], new Event('load')));
      expect(images[0].onload).toBeNull();
      expect(revokeObjectURL).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
      if (change !== 'unmount')
        expect(hook.result.current.dimensionWarning).toBeNull();
      if (change === 'close') expect(hook.result.current.files).toHaveLength(0);
    },
  );

  it('auto-submits normalized duplicate initialFiles once within maxFiles without decoding HEIC', () => {
    vi.useFakeTimers();
    const requestSubmit = vi.fn();
    const form = document.createElement('form');
    form.requestSubmit = requestSubmit;
    const hook = renderUpload({
      initialFiles: [
        new File(['a'], 'photo.HEIC'),
        new File(['duplicate'], 'photo.heic'),
        new File(['b'], 'second.HEIF'),
        new File(['c'], 'third.heic'),
      ],
      maxFiles: 2,
      autoSubmit: true,
      formRef: { current: form },
    });
    expect(hook.result.current.files.map((file) => file.name)).toEqual([
      'photo.heic',
      'second.heif',
    ]);
    expect(images).toHaveLength(0);
    act(() => vi.advanceTimersByTime(20));
    expect(requestSubmit).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(6_000));
    expect(requestSubmit).toHaveBeenCalledTimes(1);
  });

  it('auto-submits initialFiles even when a browser preview never loads', () => {
    vi.useFakeTimers();
    const requestSubmit = vi.fn();
    const form = document.createElement('form');
    form.requestSubmit = requestSubmit;
    const hook = renderUpload({
      initialFiles: [new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' })],
      autoSubmit: true,
      formRef: { current: form },
    });
    expect(hook.result.current.files).toHaveLength(1);
    act(() => vi.advanceTimersByTime(20));
    expect(requestSubmit).toHaveBeenCalledTimes(1);
  });
});

describe('actual upload service transport delegation and completion', () => {
  it.each(['presigned PUT', 'POST_JSON', 'multipart'])(
    'uses %s and forwards the real JPEG result unchanged',
    async (transport) => {
      boundary.isPresigned = transport !== 'multipart';
      if (transport === 'POST_JSON')
        boundary.presigned.mockResolvedValue({
          id: 'ingress-id',
          uploadUrl: 'https://files.example/v1/files/upload',
          s3Key: 'ingress-key',
        });
      const hook = renderUpload();
      await pick(hook, [
        new File(['original'], 'phone.HEIC', { lastModified: 987 }),
      ]);
      await act(async () => {
        await hook.result.current.handleSubmit();
      });
      if (transport !== 'multipart') {
        expect(boundary.presigned).toHaveBeenCalledWith(
          'phone.heic',
          'image/heic',
          IngredientCategory.IMAGE,
        );
        expect(boundary.servicePost).toHaveBeenCalledWith(
          'upload/confirm/ingress-id',
        );
      }
      if (transport === 'presigned PUT') {
        expect(boundary.put).toHaveBeenCalledWith(
          'https://bucket.s3.amazonaws.com/ingress',
          expect.objectContaining({
            name: 'phone.heic',
            type: 'image/heic',
            lastModified: 987,
          }),
          expect.objectContaining({
            headers: { 'Content-Type': 'image/heic' },
          }),
        );
        expect(boundary.post).not.toHaveBeenCalled();
      }
      if (transport === 'POST_JSON') {
        expect(boundary.post).toHaveBeenCalledWith(
          'https://files.example/v1/files/upload',
          {
            key: 'ingress-key',
            source: {
              contentType: 'image/heic',
              data: 'data:image/heic;base64,b3JpZ2luYWw=',
              type: 'base64',
            },
            type: IngredientCategory.IMAGE,
          },
          expect.objectContaining({
            headers: { 'Content-Type': 'application/json' },
          }),
        );
        expect(boundary.put).not.toHaveBeenCalled();
      }
      if (transport === 'multipart') {
        const form = boundary.servicePost.mock.calls[0][1] as FormData;
        expect(boundary.servicePost.mock.calls[0][0]).toBe('upload');
        expect(form.get('file')).toMatchObject({
          name: 'phone.heic',
          type: 'image/heic',
        });
        expect(form.get('category')).toBe(IngredientCategory.IMAGE);
        expect(boundary.presigned).not.toHaveBeenCalled();
      }
      expect(boundary.onComplete.mock.calls[0][0][0]).toBe(jpegResult);
      expect(boundary.closeModal).toHaveBeenCalledTimes(1);
    },
  );

  it('normalizes URL intake immediately before transport without fabricating JPEG', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        blob: () => Promise.resolve(new Blob(['original'])),
      }),
    );
    const hook = renderUpload();
    act(() =>
      hook.result.current.setUrlValue(
        'https://source.example/Phone.HEIF?download=1',
      ),
    );
    await act(async () => {
      await hook.result.current.handleSubmit();
    });
    expect(boundary.presigned).toHaveBeenCalledWith(
      'Phone.heif',
      'image/heif',
      IngredientCategory.IMAGE,
    );
    expect(boundary.put.mock.calls[0][1]).toMatchObject({
      name: 'Phone.heif',
      type: 'image/heif',
    });
    expect(boundary.onComplete.mock.calls[0][0][0]).toBe(jpegResult);
  });

  it('keeps transfer success pending until confirmation returns the actual JPEG', async () => {
    let resolveConfirmation:
      | ((value: Awaited<ReturnType<typeof boundary.servicePost>>) => void)
      | undefined;
    boundary.servicePost.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveConfirmation = resolve;
        }),
    );
    const hook = renderUpload();
    await pick(hook, [new File(['original'], 'phone.heic')]);
    let submission: Promise<void> | undefined;
    await act(async () => {
      submission = hook.result.current.handleSubmit();
    });
    expect(boundary.put).toHaveBeenCalledTimes(1);
    expect(boundary.servicePost).toHaveBeenCalledWith(
      'upload/confirm/ingress-id',
    );
    expect(
      Array.from(hook.result.current.fileStatuses.values())[0].status,
    ).toBe(UploadStatus.UPLOADING);
    expect(boundary.closeModal).not.toHaveBeenCalled();
    expect(boundary.onComplete).not.toHaveBeenCalled();
    await act(async () => {
      resolveConfirmation?.({ data: jpegResult });
      await submission;
    });
    expect(boundary.onComplete.mock.calls[0][0][0]).toBe(jpegResult);
    expect(boundary.closeModal).toHaveBeenCalledTimes(1);
  });

  it.each(['reservation', 'confirmation', 'multipart', 'POST_JSON'])(
    'keeps visible failure and modal open after %s rejection',
    async (stage) => {
      const failure = new Error(`${stage} rejected`);
      if (stage === 'reservation')
        boundary.presigned.mockRejectedValue(failure);
      if (stage === 'confirmation' || stage === 'multipart')
        boundary.servicePost.mockRejectedValue(failure);
      if (stage === 'multipart') boundary.isPresigned = false;
      if (stage === 'POST_JSON') {
        boundary.presigned.mockResolvedValue({
          id: 'ingress-id',
          uploadUrl: 'https://files.example/v1/files/upload',
          s3Key: 'ingress-key',
        });
        boundary.post.mockRejectedValue(failure);
      }
      const hook = renderUpload();
      await pick(hook, [new File(['original'], 'phone.heic')]);
      await act(async () => {
        await hook.result.current.handleSubmit();
      });
      expect(
        Array.from(hook.result.current.fileStatuses.values())[0],
      ).toMatchObject({
        status: UploadStatus.FAILED,
        error: `${stage} rejected`,
      });
      expect(hook.result.current.error).toContain('Some files failed');
      expect(hook.result.current.files).toHaveLength(1);
      expect(boundary.onComplete).not.toHaveBeenCalled();
      expect(boundary.closeModal).not.toHaveBeenCalled();
      if (stage === 'reservation') expect(boundary.put).not.toHaveBeenCalled();
    },
  );

  it.each(['rejection', 'absent result'])(
    'keeps modal open with visible failed status on %s',
    async (failure) => {
      if (failure === 'rejection')
        boundary.put.mockRejectedValue(new Error('Server rejected HEIC'));
      else boundary.mapOne.mockReturnValue(undefined);
      const hook = renderUpload();
      await pick(hook, [new File(['original'], 'phone.heic')]);
      await act(async () => {
        await hook.result.current.handleSubmit();
      });
      const status = Array.from(hook.result.current.fileStatuses.values())[0];
      expect(status.status).toBe(UploadStatus.FAILED);
      expect(status.error).toContain(
        failure === 'rejection'
          ? 'Server rejected HEIC'
          : 'did not return a result',
      );
      expect(hook.result.current.error).toContain('Some files failed');
      expect(hook.result.current.files).toHaveLength(1);
      expect(boundary.closeModal).not.toHaveBeenCalled();
      expect(boundary.onComplete).not.toHaveBeenCalled();
    },
  );

  it.each([AssetCategory.BANNER, AssetCategory.LOGO, AssetCategory.REFERENCE])(
    'retains %s asset multipart transport',
    async (category) => {
      const hook = renderUpload({ category });
      await pick(hook, [
        new File(['bytes'], 'asset.png', { type: 'image/png' }),
      ]);
      await act(async () => {
        await hook.result.current.handleSubmit();
      });
      expect(boundary.assetUpload).toHaveBeenCalledTimes(1);
      expect(boundary.presigned).not.toHaveBeenCalled();
      expect(
        (boundary.assetUpload.mock.calls[0][0] as FormData).get('file'),
      ).toMatchObject({ type: 'image/png' });
    },
  );

  it('retains voice cloning transport and required name', async () => {
    const hook = renderUpload({ category: IngredientCategory.VOICE });
    await pick(hook, [new File(['bytes'], 'voice.wav', { type: 'audio/wav' })]);
    await act(async () => {
      await hook.result.current.handleSubmit();
    });
    expect(hook.result.current.error).toBe('Voice name is required.');
    act(() => hook.result.current.setVoiceCloneName(' My voice '));
    await act(async () => {
      await hook.result.current.handleSubmit();
    });
    expect((boundary.cloneVoice.mock.calls[0][0] as FormData).get('name')).toBe(
      'My voice',
    );
    expect(boundary.presigned).not.toHaveBeenCalled();
    expect(boundary.assetUpload).not.toHaveBeenCalled();
  });
});
