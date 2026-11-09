'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { BrandFontAssetReadV1 } from '@genfeedai/contracts/api-types/contracts/brand-font-asset.contract';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { BrandFontAssetsService } from '@services/social/brand-font-assets.service';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Label } from '@ui/primitives/label';
import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ChangeEvent, useState } from 'react';
import {
  brandFontCssFamily,
  useBrandFonts,
} from '@/features/brands/hooks/use-brand-fonts';
import type { BrandFontsCardProps } from '@/features/brands/props/brand-kit-style.props';

/** The API stores WOFF2 up to 4 MB (`FONT_UPLOAD_MAX_BYTES`). */
const FONT_MAX_BYTES = 4 * 1024 * 1024;

type FontStatus =
  | 'uploaded'
  | 'removed'
  | 'notWoff2'
  | 'tooLarge'
  | 'uploadFailed'
  | 'removeFailed';

function fontName(font: BrandFontAssetReadV1): string {
  return font.displayName ?? font.originalFileName ?? font.id;
}

/**
 * The brand's own font files (#9708). Uploaded fonts can be assigned to
 * heading, body and caption in the font roles field above.
 */
export default function BrandFontsCard({
  brandId,
  isManager,
}: BrandFontsCardProps) {
  const t = useTranslations('pages.brandKitSettings.fonts');
  const getService = useAuthedService((token) =>
    BrandFontAssetsService.getInstance(token),
  );
  const { fonts, cssFamilies, isLoading, hasError, reload } =
    useBrandFonts(brandId);
  const [isBusy, setIsBusy] = useState(false);
  const [status, setStatus] = useState<FontStatus | null>(null);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.woff2')) {
      setStatus('notWoff2');
      return;
    }
    if (file.size > FONT_MAX_BYTES) {
      setStatus('tooLarge');
      return;
    }
    setIsBusy(true);
    setStatus(null);
    try {
      const service = await getService();
      await service.upload(brandId, { file, requestId: crypto.randomUUID() });
      setStatus('uploaded');
      reload();
    } catch {
      setStatus('uploadFailed');
    } finally {
      setIsBusy(false);
    }
  }

  async function remove(font: BrandFontAssetReadV1) {
    setIsBusy(true);
    setStatus(null);
    try {
      const service = await getService();
      await service.remove(brandId, font.id);
      setStatus('removed');
      reload();
    } catch {
      setStatus('removeFailed');
    } finally {
      setIsBusy(false);
    }
  }

  const isProblem =
    status === 'notWoff2' ||
    status === 'tooLarge' ||
    status === 'uploadFailed' ||
    status === 'removeFailed';

  return (
    <Card>
      <div className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-semibold">{t('title')}</h3>
          <p className="text-xs text-muted-foreground">{t('description')}</p>
        </div>
        {hasError ? (
          <p role="alert" className="text-xs text-destructive">
            {t('loadFailed')}
          </p>
        ) : null}
        {!isLoading && !hasError && fonts.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('empty')}</p>
        ) : null}
        {fonts.length > 0 ? (
          <ul aria-label={t('title')} className="flex flex-col gap-2">
            {fonts.map((font) => {
              const cssFamily = cssFamilies[font.id];
              return (
                <li
                  key={font.id}
                  className="flex items-center justify-between gap-3 rounded-md p-2 shadow-border"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">
                      {fontName(font)}
                    </p>
                    <p
                      className="truncate text-lg"
                      style={
                        cssFamily
                          ? {
                              fontFamily: `"${brandFontCssFamily(font.id)}", sans-serif`,
                            }
                          : undefined
                      }
                    >
                      {t('sample')}
                    </p>
                  </div>
                  {isManager ? (
                    <Button
                      size={ButtonSize.SM}
                      variant={ButtonVariant.GHOST}
                      ariaLabel={t('remove', { name: fontName(font) })}
                      icon={<Trash2 className="size-3.5" />}
                      isDisabled={isBusy}
                      onClick={() => void remove(font)}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
        {isManager ? (
          <Label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:border-foreground/40 font-normal leading-normal">
            <span>{t('upload')}</span>
            <Input
              aria-label={t('upload')}
              className="sr-only"
              type="file"
              accept=".woff2,font/woff2"
              disabled={isBusy}
              onChange={(event) => {
                void upload(event);
              }}
            />
          </Label>
        ) : null}
        <p className="text-2xs text-muted-foreground">{t('formatHelp')}</p>
        {status ? (
          <p
            role={isProblem ? 'alert' : 'status'}
            className={
              isProblem
                ? 'text-xs text-destructive'
                : 'text-xs text-muted-foreground'
            }
          >
            {t(status)}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
