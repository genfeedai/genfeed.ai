// @vitest-environment jsdom
'use client';

import type { IngredientCategory } from '@genfeedai/contracts';
import type {
  IAsset,
  ICredential,
  IIngredient,
  IMetadata,
  IPost,
} from '@genfeedai/contracts/interfaces';
import type { ModalExportProps } from '@genfeedai/props/modals/modal.props';
import { act, render, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GlobalModalsProvider,
  useBrandOverlay,
  useConfirmDeleteModal,
  useConfirmModal,
  useCredentialModal,
  useExportModal,
  useGalleryModal,
  useGenerateIllustrationModal,
  useIngredientOverlay,
  useMetadataModal,
  usePostMetadataOverlay,
  usePostModal,
  usePostRemixModal,
  usePromptModal,
  useUploadModal,
} from './global-modals.provider';

const captured = vi.hoisted(() => ({
  record: {} as Record<string, Record<string, unknown>>,
}));

const routerPushMock = vi.hoisted(() => vi.fn());
const reloadMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const refreshBrandsMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue(undefined),
);
const patchMeBrandMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const loggerErrorMock = vi.hoisted(() => vi.fn());
const loggerInfoMock = vi.hoisted(() => vi.fn());

function makeStub(name: string): (props: Record<string, unknown>) => null {
  return function Stub(props: Record<string, unknown>): null {
    captured.record[name] = props;
    return null;
  };
}

vi.mock('@genfeedai/hooks/auth/use-auth-user/use-auth-user', () => ({
  useAuthUser: () => ({ user: { reload: reloadMock } }),
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    credentials: [],
    refreshBrands: refreshBrandsMock,
    settings: { subscriptionTier: 'free' },
  }),
}));

vi.mock('@genfeedai/hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme${path}` }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/workspace',
  useRouter: () => ({ push: routerPushMock, refresh: vi.fn() }),
  useSearchParams: () => ({ toString: () => '' }),
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () =>
    vi.fn().mockResolvedValue({ patchMeBrand: patchMeBrandMock }),
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: {
    error: loggerErrorMock,
    info: loggerInfoMock,
    warn: vi.fn(),
  },
}));

vi.mock('@ui/lazy/modal/LazyModal', () => ({
  LazyBrandOverlay: makeStub('BrandOverlay'),
  LazyIngredientOverlay: makeStub('IngredientOverlay'),
  LazyModalConfirm: makeStub('ModalConfirm'),
  LazyModalCredential: makeStub('ModalCredential'),
  LazyModalExport: makeStub('ModalExport'),
  LazyModalGallery: makeStub('ModalGallery'),
  LazyModalGenerateIllustration: makeStub('ModalGenerateIllustration'),
  LazyModalMetadata: makeStub('ModalMetadata'),
  LazyModalPost: makeStub('ModalPost'),
  LazyModalPostBatch: makeStub('ModalPostBatch'),
  LazyModalPostRemix: makeStub('ModalPostRemix'),
  LazyModalPrompt: makeStub('ModalPrompt'),
  LazyModalUpload: makeStub('ModalUpload'),
  LazyPostMetadataOverlay: makeStub('PostMetadataOverlay'),
}));

vi.mock('@ui/modals', () => ({
  ModalUpgradePrompt: makeStub('ModalUpgradePrompt'),
}));

interface HarnessApi {
  brandOverlay: ReturnType<typeof useBrandOverlay>;
  confirm: ReturnType<typeof useConfirmModal>;
  confirmDelete: ReturnType<typeof useConfirmDeleteModal>;
  credential: ReturnType<typeof useCredentialModal>;
  exportModal: ReturnType<typeof useExportModal>;
  gallery: ReturnType<typeof useGalleryModal>;
  generateIllustration: ReturnType<typeof useGenerateIllustrationModal>;
  ingredientOverlay: ReturnType<typeof useIngredientOverlay>;
  metadata: ReturnType<typeof useMetadataModal>;
  postMetadata: ReturnType<typeof usePostMetadataOverlay>;
  postModal: ReturnType<typeof usePostModal>;
  postRemix: ReturnType<typeof usePostRemixModal>;
  prompt: ReturnType<typeof usePromptModal>;
  upload: ReturnType<typeof useUploadModal>;
}

const postCloseMock = vi.fn();
const postRefreshMock = vi.fn();
const uploadFallbackCompleteMock = vi.fn();

let api: HarnessApi;

function Harness(): null {
  api = {
    brandOverlay: useBrandOverlay(),
    confirm: useConfirmModal(),
    confirmDelete: useConfirmDeleteModal(),
    credential: useCredentialModal(),
    exportModal: useExportModal(),
    gallery: useGalleryModal(),
    generateIllustration: useGenerateIllustrationModal(),
    ingredientOverlay: useIngredientOverlay(),
    metadata: useMetadataModal(),
    postMetadata: usePostMetadataOverlay(),
    postModal: usePostModal({
      onClose: postCloseMock,
      onRefresh: postRefreshMock,
    }),
    postRemix: usePostRemixModal(),
    prompt: usePromptModal(),
    upload: useUploadModal({ onComplete: uploadFallbackCompleteMock }),
  };
  return null;
}

function renderProvider(): void {
  render(
    <GlobalModalsProvider>
      <Harness />
    </GlobalModalsProvider>,
  );
}

function getCallback<T>(stubName: string, propName: string): T {
  const props = captured.record[stubName];
  expect(props, `expected ${stubName} to be rendered`).toBeDefined();
  return props?.[propName] as T;
}

function makeIngredient(id: string): IIngredient {
  return { id, label: `Ingredient ${id}` } as unknown as IIngredient;
}

function makePost(id: string): IPost {
  return { id, label: `Post ${id}` } as unknown as IPost;
}

describe('GlobalModals hooks outside the provider', () => {
  const cases: Array<[string, () => unknown]> = [
    ['usePostModal', () => usePostModal()],
    ['useConfirmModal', () => useConfirmModal()],
    ['useUploadModal', () => useUploadModal()],
    ['useGalleryModal', () => useGalleryModal()],
    ['useIngredientOverlay', () => useIngredientOverlay()],
    ['useExportModal', () => useExportModal()],
    ['useCredentialModal', () => useCredentialModal()],
    ['usePromptModal', () => usePromptModal()],
    ['useConfirmDeleteModal', () => useConfirmDeleteModal()],
    ['useMetadataModal', () => useMetadataModal()],
    ['useBrandOverlay', () => useBrandOverlay()],
    ['usePostMetadataOverlay', () => usePostMetadataOverlay()],
    ['useGenerateIllustrationModal', () => useGenerateIllustrationModal()],
    ['usePostRemixModal', () => usePostRemixModal()],
  ];

  it.each(cases)('%s throws without GlobalModalsProvider', (name, hook) => {
    expect(() => renderHook(() => hook())).toThrowError(
      new RegExp(`${name} must be used within GlobalModalsProvider`),
    );
  });
});

describe('GlobalModals interactions', () => {
  beforeEach(() => {
    captured.record = {};
    vi.clearAllMocks();
  });

  it('opens the post batch modal for a single ingredient and closes it', () => {
    renderProvider();
    const ingredient = makeIngredient('ing_1');

    act(() => {
      api.postModal.openPostBatchModal(ingredient);
    });

    expect(captured.record.ModalPostBatch?.isOpen).toBe(true);
    expect(captured.record.ModalPostBatch?.ingredient).toBe(ingredient);
    expect(captured.record.ModalPostBatch?.ingredients).toBeUndefined();

    const refreshListener = vi.fn();
    window.addEventListener('refresh-ingredients', refreshListener);
    act(() => {
      getCallback<() => void>('ModalPostBatch', 'onConfirm')();
    });
    window.removeEventListener('refresh-ingredients', refreshListener);

    expect(refreshListener).toHaveBeenCalledTimes(1);
    expect(captured.record.ModalPostBatch?.isOpen).toBe(false);
  });

  it('opens the post batch modal for multiple ingredients, filtering falsy entries', () => {
    renderProvider();
    const first = makeIngredient('ing_1');
    const second = makeIngredient('ing_2');

    act(() => {
      api.postModal.openPostBatchModal([
        first,
        undefined as unknown as IIngredient,
        second,
      ]);
    });

    expect(captured.record.ModalPostBatch?.ingredients).toEqual([
      first,
      second,
    ]);
    expect(captured.record.ModalPostBatch?.ingredient).toBe(first);
  });

  it('handlePostClose closes the modal and calls the hook options callbacks', () => {
    renderProvider();
    act(() => {
      api.postModal.openPostBatchModal(makeIngredient('ing_1'));
    });

    act(() => {
      api.postModal.handlePostClose();
    });

    expect(postCloseMock).toHaveBeenCalledTimes(1);
    expect(postRefreshMock).toHaveBeenCalledTimes(1);
    expect(captured.record.ModalPostBatch?.isOpen).toBe(false);
  });

  it('routes to the publisher when a post is created from the post modal', () => {
    renderProvider();

    act(() => {
      getCallback<(postId: string) => void>(
        'ModalPost',
        'onCreated',
      )('post_42');
    });

    expect(routerPushMock).toHaveBeenCalledTimes(1);
    expect(String(routerPushMock.mock.calls[0]?.[0])).toContain('post_42');

    getCallback<() => void>('ModalPost', 'onConfirm')();
  });

  it('queues confirms and advances the queue as each one resolves', async () => {
    renderProvider();
    const firstConfirm = vi.fn();
    const secondConfirm = vi.fn();

    act(() => {
      api.confirm.openConfirm({
        label: 'First',
        message: 'first message',
        onConfirm: firstConfirm,
      });
      api.confirm.openConfirm({
        label: 'Second',
        message: 'second message',
        onConfirm: secondConfirm,
      });
    });

    expect(captured.record.ModalConfirm?.label).toBe('First');

    await act(async () => {
      await getCallback<() => Promise<void>>('ModalConfirm', 'onConfirm')();
    });

    expect(firstConfirm).toHaveBeenCalledTimes(1);
    expect(captured.record.ModalConfirm?.label).toBe('Second');

    act(() => {
      getCallback<() => void>('ModalConfirm', 'onClose')();
    });
    expect(secondConfirm).not.toHaveBeenCalled();
  });

  it('opens the upload modal and falls back to the hook-level onComplete', () => {
    renderProvider();

    act(() => {
      api.upload.openUpload({
        category: 'image',
        isMultiple: true,
      });
    });

    expect(captured.record.ModalUpload?.category).toBe('image');
    expect(captured.record.ModalUpload?.isOpen).toBe(true);

    const uploaded = { id: 'asset_1' } as unknown as IAsset;
    act(() => {
      getCallback<(ingredients: (IIngredient | IAsset)[]) => void>(
        'ModalUpload',
        'onComplete',
      )([uploaded]);
    });

    expect(uploadFallbackCompleteMock).toHaveBeenCalledWith([uploaded]);
  });

  it('prefers the per-call onComplete over the hook-level fallback and closes upload', () => {
    renderProvider();
    const perCallComplete = vi.fn();

    act(() => {
      api.upload.openUpload({
        category: 'video',
        onComplete: perCallComplete,
      });
    });
    act(() => {
      getCallback<(ingredients: (IIngredient | IAsset)[]) => void>(
        'ModalUpload',
        'onComplete',
      )([]);
    });

    expect(perCallComplete).toHaveBeenCalledTimes(1);
    expect(uploadFallbackCompleteMock).not.toHaveBeenCalled();

    captured.record = {};
    act(() => {
      api.upload.closeUpload();
    });
    expect(captured.record.ModalUpload).toBeUndefined();
  });

  it('opens the gallery, forwards selections, and closes on select', () => {
    renderProvider();
    const onSelect = vi.fn();

    act(() => {
      api.gallery.openGallery({
        category: 'image' as IngredientCategory,
        onSelect,
        title: 'Pick an image',
      });
    });

    expect(captured.record.ModalGallery?.isOpen).toBe(true);
    expect(captured.record.ModalGallery?.title).toBe('Pick an image');

    const selected = { id: 'asset_9' } as unknown as IAsset;
    act(() => {
      getCallback<(items: IAsset[] | null) => void>(
        'ModalGallery',
        'onSelect',
      )([selected]);
    });

    expect(onSelect).toHaveBeenCalledWith([selected]);

    act(() => {
      api.gallery.openGallery({
        category: 'image' as IngredientCategory,
        onSelect,
      });
    });
    act(() => {
      getCallback<() => void>('ModalGallery', 'onClose')();
    });
  });

  it('opens and closes the ingredient overlay, invoking onConfirm', () => {
    renderProvider();
    const onConfirm = vi.fn();
    const ingredient = makeIngredient('ing_7');

    act(() => {
      api.ingredientOverlay.openIngredientOverlay(ingredient, onConfirm);
    });
    expect(captured.record.IngredientOverlay?.ingredient).toBe(ingredient);

    act(() => {
      getCallback<() => void>('IngredientOverlay', 'onConfirm')();
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);

    captured.record = {};
    act(() => {
      api.ingredientOverlay.closeIngredientOverlay();
    });
    expect(captured.record.IngredientOverlay).toBeUndefined();
  });

  it('opens the export modal and closes after exporting', () => {
    renderProvider();
    const onExport = vi.fn();

    act(() => {
      api.exportModal.openExport({ onExport } as unknown as ModalExportProps);
    });
    expect(captured.record.ModalExport?.isOpen).toBe(true);

    act(() => {
      getCallback<(format: string, fields: string[]) => void>(
        'ModalExport',
        'onExport',
      )('csv', ['id']);
    });
    expect(onExport).toHaveBeenCalledWith('csv', ['id']);

    captured.record = {};
    act(() => {
      api.exportModal.closeExport();
    });
    expect(captured.record.ModalExport).toBeUndefined();
  });

  it('opens the credential modal and confirms', () => {
    renderProvider();
    const onConfirm = vi.fn();
    const credential = { id: 'cred_1' } as unknown as ICredential;

    act(() => {
      api.credential.openCredentialModal(credential, onConfirm);
    });
    expect(captured.record.ModalCredential?.credential).toBe(credential);

    act(() => {
      getCallback<() => void>('ModalCredential', 'onConfirm')();
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);

    captured.record = {};
    act(() => {
      api.credential.closeCredentialModal();
    });
    expect(captured.record.ModalCredential).toBeUndefined();
  });

  it('opens the prompt modal and forwards the confirmed prompt text', () => {
    renderProvider();
    const onConfirm = vi.fn();

    act(() => {
      api.prompt.openPromptModal({
        enhancedPrompt: 'better',
        originalPrompt: 'raw',
        onConfirm,
      });
    });
    expect(captured.record.ModalPrompt?.originalPrompt).toBe('raw');

    act(() => {
      getCallback<(promptData: { text: string }) => void>(
        'ModalPrompt',
        'onUsePrompt',
      )({ text: 'final prompt' });
    });
    expect(onConfirm).toHaveBeenCalledWith('final prompt');

    captured.record = {};
    act(() => {
      api.prompt.closePromptModal();
    });
    expect(captured.record.ModalPrompt).toBeUndefined();
  });

  it('opens and closes the metadata modal', () => {
    renderProvider();
    const onConfirm = vi.fn();

    act(() => {
      api.metadata.openMetadataModal({
        ingredientCategory: 'image' as IngredientCategory,
        ingredientId: 'ing_3',
        metadata: { id: 'meta_1' } as unknown as IMetadata,
        onConfirm,
      });
    });
    expect(captured.record.ModalMetadata?.ingredientId).toBe('ing_3');

    captured.record = {};
    act(() => {
      api.metadata.closeMetadataModal();
    });
    expect(captured.record.ModalMetadata).toBeUndefined();
  });

  it('confirm-delete builds a labeled confirm and skips null entities', async () => {
    renderProvider();
    const onConfirm = vi.fn();

    act(() => {
      api.confirmDelete.openConfirmDelete({
        entity: null,
        entityName: 'asset',
        onConfirm,
      });
    });
    expect(captured.record.ModalConfirm).toBeUndefined();

    act(() => {
      api.confirmDelete.openConfirmDelete({
        entity: { id: 'a_1', label: 'Hero image' },
        entityName: 'asset',
        onConfirm,
      });
    });

    expect(captured.record.ModalConfirm?.label).toBe('Delete Asset');
    expect(captured.record.ModalConfirm?.message).toContain('Hero image');
    expect(captured.record.ModalConfirm?.confirmLabel).toBe('Delete');
    expect(captured.record.ModalConfirm?.isError).toBe(true);

    await act(async () => {
      await getCallback<() => Promise<void>>('ModalConfirm', 'onConfirm')();
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);

    act(() => {
      api.confirmDelete.openConfirmDelete({
        confirmLabel: 'Remove',
        entity: { id: 'b_2' },
        entityName: 'brand',
        onConfirm,
      });
    });
    expect(captured.record.ModalConfirm?.message).toContain('b_2');
    expect(captured.record.ModalConfirm?.confirmLabel).toBe('Remove');

    act(() => {
      api.confirmDelete.closeConfirmDelete();
    });
  });

  it('brand overlay confirm without a created brand reloads user and brands', async () => {
    renderProvider();
    const onConfirm = vi.fn();

    act(() => {
      api.brandOverlay.openBrandOverlay(null, onConfirm, 'overview');
    });
    expect(captured.record.BrandOverlay?.initialView).toBe('overview');

    await act(async () => {
      await getCallback<
        (isRefreshing?: boolean, createdBrandId?: string) => Promise<void>
      >('BrandOverlay', 'onConfirm')();
    });

    expect(patchMeBrandMock).not.toHaveBeenCalled();
    expect(reloadMock).toHaveBeenCalledTimes(1);
    expect(refreshBrandsMock).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);

    captured.record = {};
    act(() => {
      api.brandOverlay.closeBrandOverlay();
    });
    expect(captured.record.BrandOverlay).toBeUndefined();
  });

  it('brand overlay confirm selects a newly created brand', async () => {
    renderProvider();

    act(() => {
      api.brandOverlay.openBrandOverlay(null);
    });

    await act(async () => {
      await getCallback<
        (isRefreshing?: boolean, createdBrandId?: string) => Promise<void>
      >('BrandOverlay', 'onConfirm')(false, 'brand_new');
    });

    expect(patchMeBrandMock).toHaveBeenCalledWith('brand_new', {
      isSelected: true,
    });
    expect(reloadMock).toHaveBeenCalledTimes(1);
    expect(refreshBrandsMock).toHaveBeenCalledTimes(1);
  });

  it('brand overlay confirm recovers when selecting the created brand fails', async () => {
    patchMeBrandMock.mockRejectedValueOnce(new Error('boom'));
    renderProvider();

    act(() => {
      api.brandOverlay.openBrandOverlay(null);
    });

    await act(async () => {
      await getCallback<
        (isRefreshing?: boolean, createdBrandId?: string) => Promise<void>
      >('BrandOverlay', 'onConfirm')(false, 'brand_bad');
    });

    expect(loggerErrorMock).toHaveBeenCalledWith(
      'Failed to select newly created brand',
      expect.any(Error),
    );
    expect(reloadMock).toHaveBeenCalledTimes(1);
    expect(refreshBrandsMock).toHaveBeenCalledTimes(1);
  });

  it('opens the post metadata overlay and closes on confirm and on close', () => {
    renderProvider();
    const onConfirm = vi.fn();
    const post = makePost('post_1');

    act(() => {
      api.postMetadata.openPostMetadataOverlay(post, onConfirm);
    });
    expect(captured.record.PostMetadataOverlay?.post).toBe(post);

    act(() => {
      getCallback<() => void>('PostMetadataOverlay', 'onConfirm')();
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);

    act(() => {
      api.postMetadata.openPostMetadataOverlay(post);
    });
    act(() => {
      getCallback<() => void>('PostMetadataOverlay', 'onConfirm')();
    });
    act(() => {
      api.postMetadata.openPostMetadataOverlay(post);
    });
    act(() => {
      getCallback<() => void>('PostMetadataOverlay', 'onClose')();
    });
  });

  it('opens the generate illustration modal and closes after confirm', () => {
    renderProvider();
    const onConfirm = vi.fn();

    act(() => {
      api.generateIllustration.openGenerateIllustration({
        initialPrompt: 'sketch',
        onConfirm,
        postId: 'post_5',
      });
    });
    expect(captured.record.ModalGenerateIllustration?.postId).toBe('post_5');

    act(() => {
      getCallback<(imageId: string) => void>(
        'ModalGenerateIllustration',
        'onConfirm',
      )('img_1');
    });
    expect(onConfirm).toHaveBeenCalledWith('img_1');

    act(() => {
      api.generateIllustration.openGenerateIllustration({
        onConfirm,
        postId: 'post_6',
      });
    });
    act(() => {
      getCallback<() => void>('ModalGenerateIllustration', 'onClose')();
    });
  });

  it('opens the post remix modal, submits, and closes', async () => {
    renderProvider();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const post = makePost('post_8');

    act(() => {
      api.postRemix.openPostRemixModal(post, onSubmit);
    });
    expect(captured.record.ModalPostRemix?.post).toBe(post);

    await act(async () => {
      await getCallback<(description: string, label?: string) => Promise<void>>(
        'ModalPostRemix',
        'onSubmit',
      )('remix it', 'Label');
    });
    expect(onSubmit).toHaveBeenCalledWith('remix it', 'Label');

    act(() => {
      api.postRemix.openPostRemixModal(post, onSubmit);
    });
    act(() => {
      getCallback<() => void>('ModalPostRemix', 'onClose')();
    });
  });
});
