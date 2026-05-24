import '@testing-library/jest-dom';
import {
  ImageFormat,
  IngredientCategory,
  IngredientFormat,
  IngredientStatus,
  VideoResolution,
} from '@genfeedai/enums';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StudioEditDetail from './StudioEditDetail';

const mocks = vi.hoisted(() => ({
  href: vi.fn((path: string) => `/org/acme/brand/demo${path}`),
  imageFindAll: vi.fn(),
  imageFindOne: vi.fn(),
  imagePost: vi.fn(),
  imagePostReframe: vi.fn(),
  imagePostUpscale: vi.fn(),
  loggerError: vi.fn(),
  push: vi.fn(),
  selectedAsset: vi.fn(),
  subscribe: vi.fn(),
  success: vi.fn(),
  unsubscribe: vi.fn(),
  videoFindAll: vi.fn(),
  videoFindOne: vi.fn(),
  videoPost: vi.fn(),
  videoPostReframe: vi.fn(),
  videoPostUpscale: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('@contexts/ui/asset-selection-context', () => ({
  useAssetSelection: () => ({
    setSelectedAsset: mocks.selectedAsset,
  }),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-1',
  }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => async () =>
    factory('token-1'),
}));

vi.mock('@hooks/data/elements/use-elements/use-elements', () => ({
  useElements: () => ({
    imageEditModels: [
      { key: 'image/edit-model', label: 'Image Edit' },
      { key: 'luma/reframe-image', label: 'Image Reframe' },
      { key: 'topazlabs/image-upscale', label: 'Image Upscale' },
    ],
    videoEditModels: [
      { key: 'video/edit-model', label: 'Video Edit' },
      { key: 'luma/reframe-video', label: 'Video Reframe' },
      { key: 'topazlabs/video-upscale', label: 'Video Upscale' },
    ],
  }),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: mocks.href,
  }),
}));

vi.mock('@hooks/utils/use-socket-manager/use-socket-manager', () => ({
  useSocketManager: () => ({
    subscribe: mocks.subscribe,
  }),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: mocks.loggerError,
  },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: mocks.warn,
      success: mocks.success,
    }),
  },
}));

vi.mock('@services/core/socket-manager.service', () => ({
  createMediaHandler:
    (
      onSuccess: (payload: unknown) => Promise<void>,
      onError: (message?: string) => void,
    ) =>
    (payload: { error?: string } | unknown) => {
      if (
        payload &&
        typeof payload === 'object' &&
        'error' in payload &&
        typeof payload.error === 'string'
      ) {
        onError(payload.error);
        return;
      }
      return onSuccess(payload);
    },
}));

vi.mock('@services/ingredients/images.service', () => ({
  ImagesService: {
    getInstance: () => ({
      findAll: mocks.imageFindAll,
      findOne: mocks.imageFindOne,
      post: mocks.imagePost,
      postReframe: mocks.imagePostReframe,
      postUpscale: mocks.imagePostUpscale,
    }),
  },
}));

vi.mock('@services/ingredients/videos.service', () => ({
  VideosService: {
    getInstance: () => ({
      findAll: mocks.videoFindAll,
      findOne: mocks.videoFindOne,
      post: mocks.videoPost,
      postReframe: mocks.videoPostReframe,
      postUpscale: mocks.videoPostUpscale,
    }),
  },
}));

vi.mock('@ui/card/Card', () => ({
  default: ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => <section className={className}>{children}</section>,
}));

vi.mock('@ui/display/video-player/VideoPlayer', () => ({
  default: ({ src }: { src: string }) => <div>Video player: {src}</div>,
}));

vi.mock('@ui/loading/default/Loading', () => ({
  default: () => <div>Loading ingredient</div>,
}));

vi.mock('@ui/prompt-bars/base/PromptBar', () => ({
  default: ({
    categoryType,
    form,
    isProcessing,
    onSubmit,
  }: {
    categoryType: IngredientCategory;
    form: {
      setValue: (name: string, value: unknown) => void;
    };
    isProcessing: boolean;
    onSubmit: () => void;
  }) => (
    <section aria-label="prompt-bar">
      <div>processing:{String(isProcessing)}</div>
      <button
        type="button"
        onClick={() => {
          form.setValue(
            'model',
            categoryType === IngredientCategory.VIDEO
              ? 'video/edit-model'
              : 'image/edit-model',
          );
          form.setValue('text', 'Make it cinematic');
          onSubmit();
        }}
      >
        Submit Generic Edit
      </button>
      <button
        type="button"
        onClick={() => {
          form.setValue(
            'model',
            categoryType === IngredientCategory.VIDEO
              ? 'luma/reframe-video'
              : 'luma/reframe-image',
          );
          form.setValue('text', 'Reframe for portrait');
          form.setValue('format', IngredientFormat.PORTRAIT);
          form.setValue('height', 1920);
          form.setValue('width', 1080);
          onSubmit();
        }}
      >
        Submit Reframe
      </button>
      <button
        type="button"
        onClick={() => {
          form.setValue(
            'model',
            categoryType === IngredientCategory.VIDEO
              ? 'topazlabs/video-upscale'
              : 'topazlabs/image-upscale',
          );
          form.setValue('text', 'Upscale sharply');
          form.setValue('resolution', VideoResolution._1080P);
          form.setValue('outputFormat', ImageFormat.PNG);
          form.setValue('faceEnhancement', true);
          form.setValue('subjectDetection', 'None');
          form.setValue('upscaleFactor', '2x');
          onSubmit();
        }}
      >
        Submit Upscale
      </button>
    </section>
  ),
}));

vi.mock('@/components/ui/client-formatted-date', () => ({
  ClientFormattedDate: ({ value }: { value: string }) => <span>{value}</span>,
}));

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <span aria-label={alt} data-src={src} role="img">
      {alt}
    </span>
  ),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.push,
  }),
}));

function makeIngredient(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    brand: 'brand-1',
    category: IngredientCategory.VIDEO,
    createdAt: '2026-01-01T00:00:00.000Z',
    height: 1080,
    id: 'video-1',
    ingredientFormat: IngredientFormat.LANDSCAPE,
    ingredientUrl: 'https://cdn.example.test/video.mp4',
    isDeleted: false,
    metadataLabel: 'Launch video',
    parent: null,
    promptText: 'Create a launch video',
    status: IngredientStatus.VALIDATED,
    thumbnailUrl: 'https://cdn.example.test/thumb.jpg',
    updatedAt: '2026-01-01T00:00:00.000Z',
    width: 1920,
    ...overrides,
  };
}

function setupVideoIngredient() {
  mocks.videoFindOne.mockImplementation((id: string) => {
    if (id === 'video-1') {
      return Promise.resolve(makeIngredient());
    }
    if (id === 'generated-video') {
      return Promise.resolve(
        makeIngredient({
          id: 'generated-video',
          metadataLabel: 'Completed video edit',
          parent: 'video-1',
        }),
      );
    }
    return Promise.resolve(makeIngredient({ id }));
  });
  mocks.videoFindAll.mockResolvedValue([
    makeIngredient({
      id: 'video-child',
      metadataLabel: 'Previous video edit',
      parent: 'video-1',
      thumbnailUrl: 'https://cdn.example.test/child.jpg',
    }),
  ]);
}

function setupImageIngredient() {
  mocks.videoFindOne.mockRejectedValue(new Error('not a video'));
  mocks.imageFindOne.mockImplementation((id: string) => {
    if (id === 'image-1') {
      return Promise.resolve(
        makeIngredient({
          category: IngredientCategory.IMAGE,
          id: 'image-1',
          ingredientFormat: IngredientFormat.SQUARE,
          ingredientUrl: 'https://cdn.example.test/image.jpg',
          metadataLabel: 'Hero image',
          parent: 'parent-image',
          status: IngredientStatus.PROCESSING,
          thumbnailUrl: 'https://cdn.example.test/image-thumb.jpg',
        }),
      );
    }
    return Promise.resolve(
      makeIngredient({
        category: IngredientCategory.IMAGE,
        id,
        ingredientUrl: 'https://cdn.example.test/completed-image.jpg',
        metadataLabel: 'Completed image edit',
      }),
    );
  });
  mocks.imageFindAll.mockImplementation((query: { parent?: string }) =>
    Promise.resolve([
      makeIngredient({
        category: IngredientCategory.IMAGE,
        id: query.parent === 'image-1' ? 'image-child' : 'image-sibling',
        metadataLabel:
          query.parent === 'image-1'
            ? 'Child image edit'
            : 'Sibling image edit',
        parent: query.parent,
        thumbnailUrl: null,
      }),
    ]),
  );
}

describe('StudioEditDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.subscribe.mockReturnValue(mocks.unsubscribe);
    mocks.videoPost.mockResolvedValue(
      makeIngredient({ id: 'generated-video' }),
    );
    mocks.videoPostReframe.mockResolvedValue(
      makeIngredient({ id: 'generated-video' }),
    );
    mocks.videoPostUpscale.mockResolvedValue(
      makeIngredient({ id: 'generated-video' }),
    );
    mocks.imagePost.mockResolvedValue(
      makeIngredient({
        category: IngredientCategory.IMAGE,
        id: 'generated-image',
      }),
    );
    mocks.imagePostReframe.mockResolvedValue(
      makeIngredient({
        category: IngredientCategory.IMAGE,
        id: 'generated-image',
      }),
    );
    mocks.imagePostUpscale.mockResolvedValue(
      makeIngredient({
        category: IngredientCategory.IMAGE,
        id: 'generated-image',
      }),
    );
    mocks.imageFindAll.mockResolvedValue([]);
    setupVideoIngredient();
  });

  it('loads a video ingredient, submits an edit, and handles socket completion', async () => {
    render(<StudioEditDetail ingredientId="video-1" />);

    expect(await screen.findByText('Launch video')).toBeVisible();
    expect(screen.getByText('Edit Video')).toBeVisible();
    expect(screen.getByText('Validated')).toBeVisible();
    expect(screen.getByText('Previous video edit')).toBeVisible();
    expect(mocks.selectedAsset).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'video-1' }),
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Submit Generic Edit' }),
    );

    await waitFor(() => {
      expect(mocks.videoPost).toHaveBeenCalledWith(
        expect.objectContaining({
          brand: 'brand-1',
          category: IngredientCategory.VIDEO,
          model: 'video/edit-model',
          parent: 'video-1',
          prompt: 'Make it cinematic',
        }),
      );
      expect(mocks.subscribe).toHaveBeenCalledWith(
        '/videos/generated-video',
        expect.any(Function),
      );
    });

    await mocks.subscribe.mock.calls.at(-1)?.[1]({ id: 'generated-video' });

    expect(await screen.findByText('Completed video edit')).toBeVisible();
    expect(mocks.success).toHaveBeenCalledWith('Edit completed successfully!');
    expect(mocks.unsubscribe).toHaveBeenCalled();
  });

  it('submits video reframe and upscale payloads', async () => {
    render(<StudioEditDetail ingredientId="video-1" />);
    expect(await screen.findByText('Launch video')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Submit Reframe' }));
    await waitFor(() =>
      expect(mocks.videoPostReframe).toHaveBeenCalledWith(
        'video-1',
        expect.objectContaining({
          format: IngredientFormat.PORTRAIT,
          height: 1920,
          model: 'luma/reframe-video',
          width: 1080,
        }),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Submit Upscale' }));
    await waitFor(() =>
      expect(mocks.videoPostUpscale).toHaveBeenCalledWith(
        'video-1',
        expect.objectContaining({
          model: 'topazlabs/video-upscale',
          targetFps: 30,
          targetResolution: VideoResolution._1080P,
        }),
      ),
    );
  });

  it('loads an image ingredient and submits image-specific edit payloads', async () => {
    setupImageIngredient();

    render(<StudioEditDetail ingredientId="image-1" />);

    await waitFor(() => {
      expect(screen.getAllByText('Hero image').length).toBeGreaterThan(0);
    });
    expect(screen.getByText('Edit Image')).toBeVisible();
    expect(screen.getByText('Processing')).toBeVisible();
    expect(screen.getByText('Sibling image edit')).toBeVisible();

    fireEvent.click(
      screen.getByRole('button', { name: 'Submit Generic Edit' }),
    );
    await waitFor(() =>
      expect(mocks.imagePost).toHaveBeenCalledWith(
        expect.objectContaining({
          category: IngredientCategory.IMAGE,
          model: 'image/edit-model',
          outputFormat: 'jpg',
          parent: 'image-1',
        }),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Submit Reframe' }));
    await waitFor(() =>
      expect(mocks.imagePostReframe).toHaveBeenCalledWith(
        'image-1',
        expect.objectContaining({
          category: IngredientCategory.IMAGE,
          format: IngredientFormat.PORTRAIT,
          model: 'luma/reframe-image',
        }),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Submit Upscale' }));
    await waitFor(() =>
      expect(mocks.imagePostUpscale).toHaveBeenCalledWith(
        'image-1',
        expect.objectContaining({
          faceEnhancement: true,
          model: 'topazlabs/image-upscale',
          outputFormat: ImageFormat.PNG,
          subjectDetection: 'Foreground',
          upscaleFactor: '2x',
        }),
      ),
    );
  });

  it('shows load errors and retries when the ingredient cannot be found', async () => {
    mocks.videoFindOne.mockRejectedValue(new Error('missing'));
    mocks.imageFindOne.mockRejectedValue(new Error('missing'));

    render(<StudioEditDetail ingredientId="missing-asset" />);

    expect(await screen.findByText('Error Loading Ingredient')).toBeVisible();
    expect(mocks.warn).toHaveBeenCalledWith('Ingredient not found');

    setupVideoIngredient();
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));

    expect(await screen.findByText('Launch video')).toBeVisible();
  });

  it('surfaces submit failures and socket failures', async () => {
    render(<StudioEditDetail ingredientId="video-1" />);
    expect(await screen.findByText('Launch video')).toBeVisible();

    mocks.videoPost.mockRejectedValueOnce(new Error('submit failed'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Submit Generic Edit' }),
    );
    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'Edit submission failed',
        expect.any(Error),
      );
      expect(mocks.warn).toHaveBeenCalledWith('Failed to submit edit');
    });

    mocks.videoPost.mockResolvedValueOnce(
      makeIngredient({ id: 'generated-video' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Submit Generic Edit' }),
    );
    await waitFor(() => expect(mocks.subscribe).toHaveBeenCalled());

    mocks.subscribe.mock.calls.at(-1)?.[1]({ error: 'Socket failed' });
    expect(mocks.warn).toHaveBeenCalledWith('Socket failed');
    expect(mocks.unsubscribe).toHaveBeenCalled();
  });
});
