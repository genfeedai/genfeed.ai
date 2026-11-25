'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import type {
  IBrandDefaultReference,
  StudioPlaygroundSettings,
  StudioPlaygroundType,
} from '@genfeedai/contracts/interfaces';
import type { PromptBarAttachedAsset } from '@genfeedai/props/studio/prompt-bar.props';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { BrandsService } from '@services/social/brands.service';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';

const NO_REFERENCES: readonly IBrandDefaultReference[] = [];
const NO_IDS: readonly string[] = [];
const AUTO_MODEL = 'auto';

/** What a submit adds to the request on top of the references the user attached. */
export interface StudioBrandDefaultReferencesRequest {
  /** Defaults the user trimmed: the ones left, sent as explicit references. */
  referenceIds: string[];
  /** Every default was removed on purpose, so the server adds none. */
  skipBrandReferences: boolean;
}

export interface UseStudioBrandDefaultReferencesParams {
  brandId: string | undefined;
  /** True when the user attached anything themselves; the server then adds none. */
  hasOwnReferences: boolean;
  settings: Pick<StudioPlaygroundSettings, 'brandingMode' | 'modelKey'>;
  type: StudioPlaygroundType;
}

export interface UseStudioBrandDefaultReferencesReturn {
  /** The brand's default references as composer chips. */
  assets: PromptBarAttachedAsset[];
  /** Removes a default chip; false when `assetId` is not one. */
  dismiss: (assetId: string) => boolean;
  request: StudioBrandDefaultReferencesRequest;
}

/**
 * The brand references an image generation attaches on its own when branding
 * is on and the user attached nothing (#11031). They come from the server, so
 * the chips shown are the references the request will use. Removing a chip is
 * the user's choice: trimmed defaults go out as explicit references, and
 * removing all of them tells the server to add none.
 */
export function useStudioBrandDefaultReferences({
  brandId,
  hasOwnReferences,
  settings,
  type,
}: UseStudioBrandDefaultReferencesParams): UseStudioBrandDefaultReferencesReturn {
  const translate = useTranslations('pages.studioPlayground.brandReference');
  const { organizationId } = useBrand();
  const { brandingMode, modelKey } = settings;
  const isActive =
    type === 'image' &&
    brandingMode === 'brand' &&
    !hasOwnReferences &&
    Boolean(brandId && organizationId && modelKey) &&
    modelKey !== AUTO_MODEL;

  const query = useAuthedQuery<
    BrandsService,
    readonly IBrandDefaultReference[]
  >({
    enabled: isActive,
    queryFn: async (service, signal) => {
      signal.throwIfAborted();
      if (!brandId) return NO_REFERENCES;
      const result = await service.getDefaultReferences(
        brandId,
        modelKey,
        signal,
      );
      return result.references ?? NO_REFERENCES;
    },
    queryKey: [
      'studio-brand-default-references',
      organizationId,
      brandId,
      modelKey,
    ],
    service: (token: string) => BrandsService.getInstance(token),
  });

  // Removals belong to one brand and model; another pick starts from all of them.
  const scopeKey = `${brandId}:${modelKey}`;
  const [removal, setRemoval] = useState<{
    ids: readonly string[];
    scopeKey: string;
  }>({ ids: NO_IDS, scopeKey });
  const removedIds = removal.scopeKey === scopeKey ? removal.ids : NO_IDS;

  const defaults = isActive ? (query.data ?? NO_REFERENCES) : NO_REFERENCES;
  const visible = useMemo(
    () =>
      defaults.filter((reference) => !removedIds.includes(reference.assetId)),
    [defaults, removedIds],
  );

  const assets = useMemo<PromptBarAttachedAsset[]>(
    () =>
      visible.map((reference) => ({
        id: reference.assetId,
        kind: 'image',
        name: translate('chip', {
          name: reference.label ?? translate(`role.${reference.role}`),
        }),
        previewUrl: reference.url,
        role: 'reference',
        source: 'library',
      })),
    [translate, visible],
  );

  const dismiss = useCallback(
    (assetId: string) => {
      if (!visible.some((reference) => reference.assetId === assetId)) {
        return false;
      }
      setRemoval((current) => ({
        ids: [
          ...(current.scopeKey === scopeKey ? current.ids : NO_IDS),
          assetId,
        ],
        scopeKey,
      }));
      return true;
    },
    [scopeKey, visible],
  );

  const request = useMemo<StudioBrandDefaultReferencesRequest>(() => {
    const isTrimmed = defaults.length > 0 && visible.length < defaults.length;
    return {
      referenceIds: isTrimmed
        ? visible.map((reference) => reference.assetId)
        : [],
      skipBrandReferences: isTrimmed && visible.length === 0,
    };
  }, [defaults, visible]);

  return { assets, dismiss, request };
}
