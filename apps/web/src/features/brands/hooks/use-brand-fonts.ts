'use client';

import type { BrandFontAssetReadV1 } from '@genfeedai/contracts/api-types/contracts/brand-font-asset.contract';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { BrandFontAssetsService } from '@services/social/brand-font-assets.service';
import { useCallback, useEffect, useState } from 'react';
import type { UseBrandFontsResult } from '@/features/brands/props/brand-kit-style.props';

/** A brand keeps a handful of fonts; one page covers them. */
const FONT_PAGE_LIMIT = 50;

const FONTS_CHANGED_EVENT = 'genfeed:brand-fonts-changed';

/** Tell every list of this brand's fonts on the page to load again. */
export function notifyBrandFontsChanged(brandId: string): void {
  window.dispatchEvent(
    new CustomEvent(FONTS_CHANGED_EVENT, { detail: brandId }),
  );
}

/** A page-local family name, so a brand font never shadows an app font. */
export function brandFontCssFamily(assetId: string): string {
  return `genfeed-brand-font-${assetId}`;
}

/**
 * The brand's uploaded fonts, each registered with the page so a preview can
 * render in it. Font files load through the authenticated API, never a public
 * URL.
 */
export function useBrandFonts(brandId: string): UseBrandFontsResult {
  const getService = useAuthedService((token) =>
    BrandFontAssetsService.getInstance(token),
  );
  const [fonts, setFonts] = useState<BrandFontAssetReadV1[]>([]);
  const [cssFamilies, setCssFamilies] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [version, setVersion] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `version` reloads the fonts after an upload or removal.
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const registered: FontFace[] = [];
    setIsLoading(true);
    setHasError(false);
    void (async () => {
      try {
        const service = await getService();
        const page = await service.list(
          brandId,
          { limit: FONT_PAGE_LIMIT },
          signal,
        );
        if (signal.aborted) return;
        setFonts(page.items);
        setIsLoading(false);
        const loaded: Record<string, string> = {};
        for (const font of page.items) {
          try {
            const bytes = await service.file(brandId, font.id, signal);
            if (signal.aborted) return;
            const face = new FontFace(brandFontCssFamily(font.id), bytes);
            await face.load();
            if (signal.aborted) return;
            document.fonts.add(face);
            registered.push(face);
            loaded[font.id] = brandFontCssFamily(font.id);
            setCssFamilies({ ...loaded });
          } catch {
            // A font that does not load keeps its name; the preview falls back.
          }
        }
      } catch {
        if (signal.aborted) return;
        setHasError(true);
        setIsLoading(false);
      }
    })();
    return () => {
      controller.abort();
      for (const face of registered) document.fonts.delete(face);
    };
  }, [brandId, getService, version]);

  // Every list of this brand's fonts on the page reloads after an upload or
  // removal, so the role pickers offer a font as soon as it is uploaded.
  useEffect(() => {
    function onChanged(event: Event) {
      if ((event as CustomEvent<string>).detail === brandId)
        setVersion((value) => value + 1);
    }
    window.addEventListener(FONTS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(FONTS_CHANGED_EVENT, onChanged);
  }, [brandId]);

  const reload = useCallback(() => notifyBrandFontsChanged(brandId), [brandId]);

  return { cssFamilies, fonts, hasError, isLoading, reload };
}
