'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  BRAND_PALETTE_MAX_COLORS,
  BRAND_PALETTE_NAME_MAX,
  BRAND_PALETTE_USAGE_MAX,
  type BrandPaletteColor,
} from '@genfeedai/contracts/api-types/contracts/brand-kit-style.contract';
import type { IBrandKitLogoColor } from '@genfeedai/contracts/interfaces';
import { ClipboardService } from '@genfeedai/services/core/clipboard.service';
import { isRecord } from '@genfeedai/utils/data/extract.util';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { BrandsService } from '@services/social/brands.service';
import { Button } from '@ui/primitives/button';
import { ColorInput } from '@ui/primitives/color-input';
import { Input } from '@ui/primitives/input';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import type { BrandStyleFieldEditorProps } from '@/features/brands/props/brand-kit-style.props';
import {
  isBrandKitHexColor,
  toColorPickerValue,
} from './brand-kit-color-value';

/** Draft rows: a color may be half typed, so nothing here is validated yet. */
function readRows(value: unknown): BrandPaletteColor[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) =>
    isRecord(entry)
      ? [
          {
            hex: typeof entry.hex === 'string' ? entry.hex : '#000000',
            name: typeof entry.name === 'string' ? entry.name : '',
            ...(typeof entry.usage === 'string' ? { usage: entry.usage } : {}),
          },
        ]
      : [],
  );
}

/**
 * The brand's named colors (#9709), next to primary, secondary and
 * background. Each has a name, a hex value and a usage note; candidates can be
 * read from the primary logo.
 */
export default function BrandPaletteEditor({
  brandId,
  label,
  value,
  isDisabled,
  onChange,
}: BrandStyleFieldEditorProps) {
  const t = useTranslations('pages.brandOsSettings.palette');
  const getService = useAuthedService((token) =>
    BrandsService.getInstance(token),
  );
  const rows = readRows(value);
  const nextKey = useRef(rows.length);
  const [keys, setKeys] = useState(() => rows.map((_, index) => String(index)));
  const [candidates, setCandidates] = useState<IBrandKitLogoColor[] | null>(
    null,
  );
  const [isReadingLogo, setIsReadingLogo] = useState(false);
  const [hasLogoError, setHasLogoError] = useState(false);
  if (keys.length !== rows.length) {
    setKeys(rows.map(() => String(nextKey.current++)));
  }
  const isFull = rows.length >= BRAND_PALETTE_MAX_COLORS;

  function update(next: BrandPaletteColor[]) {
    onChange(next);
  }

  function addColor(hex: string) {
    if (isFull) return;
    setKeys((current) => [...current, String(nextKey.current++)]);
    update([
      ...rows,
      { hex, name: t('newColorName', { index: rows.length + 1 }) },
    ]);
  }

  async function readLogoColors() {
    setIsReadingLogo(true);
    setHasLogoError(false);
    try {
      const service = await getService();
      setCandidates(await service.getLogoColorCandidates(brandId));
    } catch {
      setHasLogoError(true);
    } finally {
      setIsReadingLogo(false);
    }
  }

  const knownHexes = new Set(rows.map((row) => row.hex.toUpperCase()));

  return (
    <div className="flex flex-col gap-3">
      <ul aria-label={label} className="flex flex-col gap-2">
        {rows.map((row, index) => (
          <li key={keys[index]} className="flex flex-wrap items-center gap-2">
            <ColorInput
              aria-label={t('colorValue', { name: row.name || index + 1 })}
              disabled={isDisabled}
              value={toColorPickerValue(row.hex)}
              onChange={(event) =>
                update(
                  rows.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, hex: event.target.value.toUpperCase() }
                      : item,
                  ),
                )
              }
            />
            <code className="text-xs">{row.hex.toUpperCase()}</code>
            <Button
              size={ButtonSize.SM}
              variant={ButtonVariant.GHOST}
              ariaLabel={t('copyHex', { hex: row.hex.toUpperCase() })}
              icon={<Copy className="size-3.5" />}
              isDisabled={!isBrandKitHexColor(row.hex)}
              onClick={() =>
                ClipboardService.getInstance().copyToClipboard(
                  row.hex.toUpperCase(),
                )
              }
            />
            <Input
              className="w-36"
              aria-label={t('colorName', { index: index + 1 })}
              disabled={isDisabled}
              maxLength={BRAND_PALETTE_NAME_MAX}
              value={row.name}
              onChange={(event) =>
                update(
                  rows.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, name: event.target.value }
                      : item,
                  ),
                )
              }
            />
            <Input
              className="min-w-40 flex-1"
              aria-label={t('colorUsage', { name: row.name || index + 1 })}
              placeholder={t('usagePlaceholder')}
              disabled={isDisabled}
              maxLength={BRAND_PALETTE_USAGE_MAX}
              value={row.usage ?? ''}
              onChange={(event) =>
                update(
                  rows.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, usage: event.target.value || undefined }
                      : item,
                  ),
                )
              }
            />
            <Button
              size={ButtonSize.SM}
              variant={ButtonVariant.GHOST}
              ariaLabel={t('removeColor', { name: row.name || index + 1 })}
              icon={<Trash2 className="size-3.5" />}
              isDisabled={isDisabled}
              onClick={() => {
                setKeys((current) =>
                  current.filter((_, itemIndex) => itemIndex !== index),
                );
                update(rows.filter((_, itemIndex) => itemIndex !== index));
              }}
            />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          icon={<Plus className="size-3.5" />}
          label={t('addColor')}
          isDisabled={isDisabled || isFull}
          onClick={() => addColor('#000000')}
        />
        <Button
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          label={t('fromLogo')}
          isDisabled={isDisabled || isReadingLogo}
          isLoading={isReadingLogo}
          onClick={() => void readLogoColors()}
        />
      </div>
      {hasLogoError ? (
        <p className="text-xs text-destructive">{t('fromLogoFailed')}</p>
      ) : null}
      {candidates !== null ? (
        candidates.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('fromLogoEmpty')}</p>
        ) : (
          <div
            role="group"
            aria-label={t('logoCandidates')}
            className="flex flex-wrap gap-2"
          >
            {candidates.map((candidate) => (
              <Button
                key={candidate.hex}
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
                ariaLabel={t('addCandidate', { hex: candidate.hex })}
                isDisabled={
                  isDisabled || isFull || knownHexes.has(candidate.hex)
                }
                onClick={() => addColor(candidate.hex)}
                icon={
                  <span
                    aria-hidden="true"
                    className="size-3.5 rounded-sm shadow-border"
                    style={{ backgroundColor: candidate.hex }}
                  />
                }
                label={candidate.hex}
              />
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}
