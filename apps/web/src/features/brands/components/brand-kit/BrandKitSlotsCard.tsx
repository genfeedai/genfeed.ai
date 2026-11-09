'use client';

import {
  AssetCategory,
  BrandKitSlot,
  ButtonVariant,
} from '@genfeedai/contracts';
import {
  BRAND_KIT_LOGO_SLOTS,
  BRAND_KIT_PLATFORM_SLOTS,
} from '@genfeedai/contracts/constants';
import type { IAsset } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { EnvironmentService } from '@services/core/environment.service';
import { BrandsService } from '@services/social/brands.service';
import Card from '@ui/card/Card';
import Masonry from '@ui/display/masonry/Masonry';
import { Alert } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { BrandKitSlotsCardProps } from '@/features/brands/props/brand-kit-slots.props';
import BrandKitSlotTile from './BrandKitSlotTile';

const LOGO_COLUMNS = { default: 2, lg: 3, sm: 3 };
const PLATFORM_COLUMNS = { default: 1, sm: 2 };

/** A slotless asset predates slots and reads as the primary logo or master banner. */
function assetsBySlot(
  assets: readonly IAsset[] | undefined,
  defaultSlot: BrandKitSlot,
): Map<BrandKitSlot, IAsset> {
  return new Map(
    (assets ?? []).map((asset) => [asset.kitSlot ?? defaultSlot, asset]),
  );
}

/**
 * The API signs `cdnUrl` and sends `null` when it withholds the media, which
 * means no image. A missing `cdnUrl` (unsigned CDN) falls back to the path.
 */
function assetUrl(asset: IAsset | undefined): string | undefined {
  if (!asset) return undefined;
  const cdnUrl = asset.cdnUrl as string | null | undefined;
  if (cdnUrl === null) return undefined;
  const folder = asset.category === AssetCategory.BANNER ? 'banners' : 'logos';
  return cdnUrl ?? `${EnvironmentService.cdnUrl}/${folder}/${asset.id}`;
}

/**
 * The brand's logo variants and platform images (#9705, #9707): one live
 * asset per slot, each uploaded through the shared upload flow.
 */
export default function BrandKitSlotsCard({
  brand,
  brandId,
  isManager,
  onUpload,
  onRefreshBrand,
}: BrandKitSlotsCardProps) {
  const t = useTranslations('pages.brandKitSettings.slots');
  const getService = useAuthedService((token) =>
    BrandsService.getInstance(token),
  );
  // One fill at a time: overlapping fills would race on the same slots.
  const [isFilling, setIsFilling] = useState(false);
  const [fillStatus, setFillStatus] = useState<{
    filled: number;
    failed: string[];
  } | null>(null);

  const logos = assetsBySlot(
    brand.logos ?? (brand.logo ? [brand.logo] : []),
    BrandKitSlot.LOGO_PRIMARY,
  );
  const banners = assetsBySlot(
    brand.banners ?? (brand.banner ? [brand.banner] : []),
    BrandKitSlot.BANNER_MASTER,
  );
  const hasMaster = banners.has(BrandKitSlot.BANNER_MASTER);
  const emptyPlatformSlots = BRAND_KIT_PLATFORM_SLOTS.filter(
    (spec) =>
      spec.slot !== BrandKitSlot.BANNER_MASTER && !banners.has(spec.slot),
  ).map((spec) => spec.slot);

  async function fillFromMaster(slots: BrandKitSlot[]) {
    if (slots.length === 0 || isFilling) return;
    setIsFilling(true);
    setFillStatus(null);
    try {
      const service = await getService();
      const results = await service.fillPlatformImagesFromMaster(
        brandId,
        slots,
      );
      setFillStatus({
        failed: results
          .filter((result) => result.status === 'failed')
          .map((result) => t(`slot.${result.slot}`)),
        filled: results.filter((result) => result.status === 'filled').length,
      });
      await onRefreshBrand();
    } catch {
      setFillStatus({
        failed: slots.map((slot) => t(`slot.${slot}`)),
        filled: 0,
      });
    } finally {
      setIsFilling(false);
    }
  }

  return (
    <>
      <Card>
        <div className="flex flex-col gap-3">
          <div>
            <h3 className="text-sm font-semibold">{t('logosTitle')}</h3>
            <p className="text-xs text-muted-foreground">
              {t('logosDescription')}
            </p>
          </div>
          <Masonry columns={LOGO_COLUMNS} gap={12}>
            {BRAND_KIT_LOGO_SLOTS.map((spec) => {
              const asset = logos.get(spec.slot);
              return (
                <BrandKitSlotTile
                  key={spec.slot}
                  spec={spec}
                  asset={asset}
                  imageUrl={assetUrl(asset)}
                  isDefault={spec.slot === BrandKitSlot.LOGO_PRIMARY}
                  isManager={isManager}
                  onUpload={() => onUpload(spec.slot)}
                />
              );
            })}
          </Masonry>
        </div>
      </Card>
      <Card>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">{t('platformTitle')}</h3>
              <p className="text-xs text-muted-foreground">
                {t('platformDescription')}
              </p>
            </div>
            {isManager && hasMaster && emptyPlatformSlots.length > 0 ? (
              <Button
                variant={ButtonVariant.SECONDARY}
                isDisabled={isFilling}
                onClick={() => fillFromMaster(emptyPlatformSlots)}
              >
                {t('fillEmptyFromMaster')}
              </Button>
            ) : null}
          </div>
          {isManager && !hasMaster ? (
            <Alert size="sm" variant="note">
              {t('noMaster')}
            </Alert>
          ) : null}
          {isManager && hasMaster ? (
            <p className="text-2xs text-muted-foreground">{t('fillHelp')}</p>
          ) : null}
          {fillStatus ? (
            <p
              role="status"
              className={
                fillStatus.failed.length > 0
                  ? 'text-xs text-destructive'
                  : 'text-xs text-muted-foreground'
              }
            >
              {fillStatus.filled > 0
                ? t('filled', { count: fillStatus.filled })
                : null}
              {fillStatus.filled > 0 && fillStatus.failed.length > 0
                ? ' · '
                : null}
              {fillStatus.failed.length > 0
                ? t('fillFailed', { slots: fillStatus.failed.join(', ') })
                : null}
            </p>
          ) : null}
          <Masonry columns={PLATFORM_COLUMNS} gap={12}>
            {BRAND_KIT_PLATFORM_SLOTS.map((spec) => {
              const asset = banners.get(spec.slot);
              const isMaster = spec.slot === BrandKitSlot.BANNER_MASTER;
              return (
                <BrandKitSlotTile
                  key={spec.slot}
                  spec={spec}
                  asset={asset}
                  imageUrl={assetUrl(asset)}
                  isDefault={isMaster}
                  isFilling={isFilling}
                  isManager={isManager}
                  onUpload={() => onUpload(spec.slot)}
                  onFillFromMaster={
                    !isMaster && hasMaster
                      ? () => fillFromMaster([spec.slot])
                      : undefined
                  }
                />
              );
            })}
          </Masonry>
        </div>
      </Card>
    </>
  );
}
