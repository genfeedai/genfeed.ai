import {
  IngredientCategory,
  IngredientStatus,
  ModelCategory,
} from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { IIngredient, IModel } from '@genfeedai/contracts/interfaces';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStudioPlaygroundTransformActions } from './useStudioPlaygroundTransformActions';

const mocks = vi.hoisted(() => ({
  useController: vi.fn(),
  useElements: vi.fn(),
  upscale: vi.fn(),
  extend: vi.fn(),
  upscaleAvailability: vi.fn(),
  extendAvailability: vi.fn(),
}));
vi.mock('@hooks/data/elements/use-elements/use-elements', () => ({
  useElements: mocks.useElements,
}));
vi.mock(
  '@hooks/ui/ingredient/use-ingredient-actions/use-ingredient-actions',
  () => ({
    useIngredientActions: (options: unknown) => {
      mocks.useController(options);
      return {
        actionStates: { isUpscaling: false, isExtending: false },
        handlers: { handleUpscale: mocks.upscale, handleExtend: mocks.extend },
        getUpscaleAvailability: mocks.upscaleAvailability,
        getExtendAvailability: mocks.extendAvailability,
        upscaleConfirmData: null,
        extendConfirmData: null,
        executeUpscale: vi.fn(),
        clearUpscaleConfirm: vi.fn(),
        executeExtend: vi.fn(),
        clearExtendConfirm: vi.fn(),
      };
    },
  }),
);
const image = {
  id: 'source-image',
  brandId: 'brand-1',
  organizationId: 'org-1',
  category: IngredientCategory.IMAGE,
  status: IngredientStatus.GENERATED,
} as IIngredient;
const video = {
  ...image,
  id: 'source-video',
  category: IngredientCategory.VIDEO,
} as IIngredient;
const params = {
  brandId: 'brand-1',
  organizationId: 'org-1',
  scopeKey: 'org-1:brand-1:user-1:session-1',
  onRefresh: vi.fn(),
};
const models = {
  imageModels: [
    {
      key: MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_3_IMAGE,
      category: ModelCategory.IMAGE,
      maxReferences: 1,
    },
  ] as IModel[],
  imageEditModels: [
    {
      key: MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_3_IMAGE_EDIT,
      category: ModelCategory.IMAGE_EDIT,
    },
  ] as IModel[],
  videoModels: [
    {
      key: MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1,
      category: ModelCategory.VIDEO,
      maxReferences: 1,
    },
  ] as IModel[],
  isLoading: false,
};

describe('workspace canonical transform adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useElements.mockReturnValue(models);
    mocks.upscaleAvailability.mockReturnValue({ isAvailable: true });
    mocks.extendAvailability.mockReturnValue({ isAvailable: true });
  });
  it('passes one scope and refresh callback to the existing controller and reuses its confirmation', () => {
    const { result } = renderHook(() =>
      useStudioPlaygroundTransformActions(params),
    );
    expect(mocks.useController).toHaveBeenCalledTimes(1);
    expect(mocks.useController).toHaveBeenCalledWith({
      scopeKey: params.scopeKey,
      onRefresh: params.onRefresh,
    });
    expect(result.current.confirmation.upscaleConfirmData).toBeNull();
    expect(result.current.confirmation.extendConfirmData).toBeNull();
  });
  it('prepares supported image continuations without executing a transform', () => {
    const { result } = renderHook(() =>
      useStudioPlaygroundTransformActions(params),
    );
    for (const operation of ['edit', 'variation', 'animate'] as const)
      expect(
        result.current.transformActions.getAvailability(image, operation),
      ).toEqual({ isAvailable: true });
    expect(mocks.upscale).not.toHaveBeenCalled();
    expect(mocks.extend).not.toHaveBeenCalled();
  });
  it('uses the canonical quote availability without changing unknown prices', () => {
    mocks.upscaleAvailability.mockReturnValue({
      isAvailable: false,
      reason: 'priceUnavailable',
    });
    const { result } = renderHook(() =>
      useStudioPlaygroundTransformActions(params),
    );
    expect(
      result.current.transformActions.getAvailability(image, 'upscale'),
    ).toEqual({ isAvailable: false, reason: 'priceUnavailable' });
    expect(mocks.upscaleAvailability).toHaveBeenCalledWith(image);
  });
  it('explains loading and missing model contracts while keeping Editor a source handoff', () => {
    mocks.useElements.mockReturnValue({
      imageModels: [],
      imageEditModels: [],
      videoModels: [],
      isLoading: true,
    });
    const { result, rerender } = renderHook(() =>
      useStudioPlaygroundTransformActions(params),
    );
    expect(
      result.current.transformActions.getAvailability(image, 'animate').reason,
    ).toBe('catalogLoading');
    expect(
      result.current.transformActions.getAvailability(video, 'editor')
        .isAvailable,
    ).toBe(true);
    mocks.useElements.mockReturnValue({
      imageModels: [],
      imageEditModels: [],
      videoModels: [],
      isLoading: false,
    });
    rerender();
    for (const operation of ['edit', 'variation', 'animate'] as const)
      expect(
        result.current.transformActions.getAvailability(image, operation)
          .reason,
      ).toBe('modelUnavailable');
  });
  it.each([
    { ...image, brandId: 'foreign-brand' },
    { ...image, organizationId: 'foreign-org' },
    { ...image, isDeleted: true },
    { ...image, status: IngredientStatus.PROCESSING },
  ])(
    'rejects a stale or unavailable source before either transform handler (%j)',
    async (source) => {
      const { result } = renderHook(() =>
        useStudioPlaygroundTransformActions(params),
      );
      expect(
        result.current.transformActions.getAvailability(source, 'upscale')
          .reason,
      ).toBe('sourceUnavailable');
      await act(async () => {
        await result.current.transformActions.onUpscale(source);
        await result.current.transformActions.onExtend(source);
      });
      expect(mocks.upscale).not.toHaveBeenCalled();
      expect(mocks.extend).not.toHaveBeenCalled();
    },
  );
  it('keeps callbacks bound to each original source and rejects the previous brand after rerender', async () => {
    const { result, rerender } = renderHook(
      (scope) => useStudioPlaygroundTransformActions(scope),
      { initialProps: params },
    );
    await act(async () => {
      await result.current.transformActions.onUpscale(image);
      result.current.transformActions.onExtend(video);
    });
    expect(mocks.upscale).toHaveBeenCalledWith(image);
    expect(mocks.extend).toHaveBeenCalledWith(video);
    rerender({
      ...params,
      brandId: 'brand-2',
      scopeKey: 'org-1:brand-2:user-1:session-1',
    });
    await act(async () => {
      await result.current.transformActions.onUpscale(image);
    });
    expect(mocks.upscale).toHaveBeenCalledTimes(1);
  });
});
