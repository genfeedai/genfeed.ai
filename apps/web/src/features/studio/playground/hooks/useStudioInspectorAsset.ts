'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { isLibraryReferenceOrigin } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import type { StudioPlaygroundJob } from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { ImagesService } from '@services/ingredients/images.service';
import { VideosService } from '@services/ingredients/videos.service';
import { useMemo } from 'react';
import { useIngredientGenerationCost } from '@/components/ingredients/inspector/use-ingredient-generation-cost';

interface ReceiptServices {
  images: ImagesService;
  videos: VideosService;
}

function createReceiptServices(token: string): ReceiptServices {
  return {
    images: ImagesService.getInstance(token),
    videos: VideosService.getInstance(token),
  };
}

interface UseStudioInspectorAssetParams {
  job: StudioPlaygroundJob;
  runJobs: readonly StudioPlaygroundJob[];
}

/**
 * The asset an Inspector shows: the job's ingredient when it belongs to this
 * brand and organization, the receipt read for its generation harness, what
 * the generation cost, and the other jobs of the same run.
 */
export function useStudioInspectorAsset({
  job,
  runJobs,
}: UseStudioInspectorAssetParams) {
  const { brandId } = useBrand();
  const { orgId } = useAuthIdentity();
  const siblingJobs = useMemo(
    () => runJobs.filter((candidate) => candidate.id !== job.id),
    [job.id, runJobs],
  );
  const ingredientId = job.ingredientId;
  const ingredient =
    job.ingredient?.brandId === brandId &&
    !job.ingredient.isDeleted &&
    (!orgId ||
      !job.ingredient.organizationId ||
      job.ingredient.organizationId === orgId)
      ? job.ingredient
      : null;
  const isSourceUnavailable = Boolean(job.ingredient && !ingredient);
  // Only image and video generations carry a harness receipt, and the API
  // reads a single asset through its category route; there is no generic
  // single-ingredient read.
  const receiptCategory =
    job.type === 'image' || job.type === 'image-edit'
      ? 'image'
      : job.type === 'video' || job.type === 'avatar'
        ? 'video'
        : null;
  const isReceiptReadEnabled =
    Boolean(ingredientId) && receiptCategory !== null && !isSourceUnavailable;
  // Cached per asset and brand: reopening an asset paints its receipt at once
  // while it refreshes in the background.
  const receiptQuery = useAuthedQuery<ReceiptServices, IIngredient>({
    enabled: isReceiptReadEnabled,
    queryFn: async (services, signal) => {
      if (!ingredientId || !receiptCategory) {
        throw new Error('studio_inspector_receipt_unavailable');
      }
      const service =
        receiptCategory === 'image' ? services.images : services.videos;
      return await service.findOne(ingredientId, undefined, signal);
    },
    queryKey: [
      'studio-inspector-receipt',
      receiptCategory,
      ingredientId ?? null,
      brandId ?? null,
    ],
    service: createReceiptServices,
  });
  const isOwnReceipt = (asset: IIngredient | undefined): boolean =>
    asset !== undefined &&
    asset.id === ingredientId &&
    asset.brandId === brandId &&
    (!orgId || !asset.organizationId || asset.organizationId === orgId) &&
    !asset.isDeleted;
  const currentReceipt =
    isReceiptReadEnabled && receiptQuery.data && isOwnReceipt(receiptQuery.data)
      ? receiptQuery.data
      : null;
  // A failed background refresh keeps the receipt on screen; the error only
  // shows when there is nothing valid to show.
  const receiptError =
    isReceiptReadEnabled &&
    !currentReceipt &&
    (receiptQuery.isError || receiptQuery.data !== undefined);
  // Uploads and imports were never charged; an asset may not carry its origin
  // yet, so only a known reference origin skips the read. A job that only has
  // an ingredient id is priced from the receipt asset once it loads.
  const costAsset = ingredient ?? currentReceipt;
  const generationCost = useIngredientGenerationCost(
    costAsset?.id ?? '',
    Boolean(costAsset) && !isLibraryReferenceOrigin(costAsset?.origin),
  );
  const continuationJob = currentReceipt
    ? { ...job, ingredient: currentReceipt }
    : job;
  return {
    continuationJob,
    currentReceipt,
    generationCost,
    ingredient,
    ingredientId,
    isOwnReceipt,
    isReceiptReadEnabled,
    isSourceUnavailable,
    receiptError,
    refetchReceipt: receiptQuery.refetch,
    siblingJobs,
  };
}
