'use client';

import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { useAuthorizedMediaPreview } from './use-authorized-media-preview';

/**
 * The URL to play an ingredient's video or audio from. On Cloud that is the
 * issued media grant, refreshed before it expires; elsewhere it is the
 * ingredient's own URL. There is deliberately no raw CDN path fallback: it is
 * unreadable on Cloud, so an unavailable grant yields no URL instead.
 */
export function useIngredientMediaUrl(
  ingredient: IIngredient | null | undefined,
): string | undefined {
  const grant = useAuthorizedMediaPreview(ingredient ?? null);
  return (
    (grant ? grant.url : ingredient?.ingredientUrl || ingredient?.cdnUrl) ||
    undefined
  );
}
