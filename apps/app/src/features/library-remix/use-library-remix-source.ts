'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { AssetParent } from '@genfeedai/enums';
import type { IAsset, IIngredient } from '@genfeedai/interfaces';
import { AssetsService } from '@genfeedai/services/content/assets.service';
import { IngredientsService } from '@genfeedai/services/content/ingredients.service';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCallback, useEffect, useState } from 'react';
import {
  type LibraryArtifactReference,
  parseLibraryRemixSource,
  readRelationshipId,
} from './library-remix-reference';

export type LibraryRemixSourceRecord = IAsset | IIngredient;

export type LibraryRemixSourceStatus =
  | 'error'
  | 'invalid'
  | 'loading'
  | 'permission-denied'
  | 'ready'
  | 'stale';

export interface UseLibraryRemixSourceResult {
  readonly record: LibraryRemixSourceRecord | null;
  readonly reference: LibraryArtifactReference | null;
  readonly retry: () => void;
  readonly status: LibraryRemixSourceStatus;
}

function getErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object' || !('status' in error)) {
    return null;
  }

  return typeof error.status === 'number' ? error.status : null;
}

function isAssetInBrand(asset: IAsset, brandId: string): boolean {
  return (
    !asset.isDeleted &&
    asset.parentModel === AssetParent.BRAND &&
    asset.parent === brandId
  );
}

function isIngredientInScope(
  ingredient: IIngredient,
  brandId: string,
  organizationId: string,
): boolean {
  return (
    readRelationshipId(ingredient.brand) === brandId &&
    readRelationshipId(ingredient.organization) === organizationId
  );
}

export function useLibraryRemixSource(
  sourceArtifact: string | null | undefined,
  sourceVersion?: string | null,
): UseLibraryRemixSourceResult {
  const { brandId, isReady, organizationId } = useBrand();
  const [reloadVersion, setReloadVersion] = useState(0);
  const [state, setState] = useState<{
    record: LibraryRemixSourceRecord | null;
    reference: LibraryArtifactReference | null;
    status: LibraryRemixSourceStatus;
  }>({ record: null, reference: null, status: 'loading' });
  const getAssetsService = useAuthedService((token: string) =>
    AssetsService.getInstance(token),
  );
  const getIngredientsService = useAuthedService((token: string) =>
    IngredientsService.getInstance(token),
  );

  const resolve = useCallback(
    async (signal: AbortSignal) => {
      if (!isReady) {
        return;
      }
      if (!brandId || !organizationId) {
        setState({
          record: null,
          reference: null,
          status: 'permission-denied',
        });
        return;
      }

      const reference = parseLibraryRemixSource(
        sourceArtifact,
        {
          brandId,
          organizationId,
        },
        sourceVersion,
      );
      if (!reference) {
        setState({ record: null, reference: null, status: 'invalid' });
        return;
      }

      setState({ record: null, reference, status: 'loading' });
      try {
        if (reference.kind === 'asset') {
          const service = await getAssetsService();
          const asset = await service.findOne(reference.recordId, {}, signal);
          if (signal.aborted) {
            return;
          }
          if (!isAssetInBrand(asset, brandId)) {
            setState({ record: null, reference, status: 'permission-denied' });
            return;
          }

          setState({ record: asset, reference, status: 'ready' });
          return;
        }

        const service = (await getIngredientsService()) as IngredientsService;
        const ingredients = await service.findByIds([reference.recordId]);
        if (signal.aborted) {
          return;
        }
        const ingredient = ingredients.find(
          (candidate) => candidate.id === reference.recordId,
        );
        if (!ingredient) {
          setState({ record: null, reference, status: 'stale' });
          return;
        }
        if (!isIngredientInScope(ingredient, brandId, organizationId)) {
          setState({ record: null, reference, status: 'permission-denied' });
          return;
        }
        if (
          reference.recordVersion &&
          ingredient.version?.toString() !== reference.recordVersion
        ) {
          setState({ record: null, reference, status: 'stale' });
          return;
        }

        setState({ record: ingredient, reference, status: 'ready' });
      } catch (error) {
        if (signal.aborted) {
          return;
        }
        const status = getErrorStatus(error);
        setState({
          record: null,
          reference,
          status:
            status === 404
              ? 'stale'
              : status === 401 || status === 403
                ? 'permission-denied'
                : 'error',
        });
      }
    },
    [
      brandId,
      getAssetsService,
      getIngredientsService,
      isReady,
      organizationId,
      sourceArtifact,
      sourceVersion,
    ],
  );

  useEffect(() => {
    void reloadVersion;
    const abortController = new AbortController();
    void resolve(abortController.signal);
    return () => abortController.abort();
  }, [reloadVersion, resolve]);

  return {
    ...state,
    retry: () => setReloadVersion((version) => version + 1),
  };
}
