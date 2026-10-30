import {
  type BrandWatermarkSettings,
  watermarkLogoIdFor,
  watermarkPlacementFor,
} from '@api/collections/brands/utils/brand-watermark-layer.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  ICoverStyle,
  ICoverTitleStyle,
  IWatermarkLayer,
  WatermarkVariant,
} from '@genfeedai/contracts/interfaces';
import { Injectable } from '@nestjs/common';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
/** WCAG contrast an accent needs against the near-black cover scrim. */
const MIN_ACCENT_CONTRAST = 3;
/** A cover is a thumbnail, so a brand without its own mark size gets a modest one. */
const DEFAULT_COVER_SIGNATURE_RATIO = 0.1;
const POSITIONS: readonly string[] = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
];

function channel(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return (
    0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue)
  );
}

/** Contrast of a colour against black, from 1 to 21. */
function contrastOnBlack(hex: string): number {
  return (luminance(hex) + 0.05) / 0.05;
}

export interface BrandCoverStyleSource {
  fontFamily: string | null;
  primaryColor: string | null;
}

/**
 * The cover title style a brand's own settings give: its font, white type for
 * the dark scrim, and its primary colour on the last word when that colour
 * reads on black. Pure so the preview and the published file share one rule.
 */
export function buildCoverTitleStyle(
  brand: BrandCoverStyleSource,
): ICoverTitleStyle {
  const accent = brand.primaryColor ?? '';
  const hasReadableAccent =
    HEX_COLOR.test(accent) && contrastOnBlack(accent) >= MIN_ACCENT_CONTRAST;
  return {
    accentColor: hasReadableAccent ? accent.toUpperCase() : undefined,
    color: '#FFFFFF',
    fontFamily: brand.fontFamily ?? undefined,
  };
}

/** The signature layer for a brand, or `undefined` when it has no usable mark. */
export function buildCoverSignature(
  brand: BrandWatermarkSettings & { watermarkText?: string | null },
  logoStorageKey: string | undefined,
): IWatermarkLayer | undefined {
  const text = brand.watermarkText?.trim();
  const placement = watermarkPlacementFor(brand);
  const isUsable =
    POSITIONS.includes(placement.position) &&
    Number.isFinite(placement.opacity) &&
    placement.opacity >= 0.05 &&
    placement.opacity <= 1;
  if (!isUsable || (!logoStorageKey && !text)) return undefined;
  return {
    ...placement,
    logoStorageKey,
    sizeRatio: placement.sizeRatio ?? DEFAULT_COVER_SIGNATURE_RATIO,
    text: logoStorageKey ? undefined : text,
  };
}

/** Looks up a brand and turns its settings into a cover style. */
@Injectable()
export class BrandCoverStyleService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The title style and signature the brand gives a cover. `undefined` when
   * there is no brand or it is not in the organization, so a cover without a
   * brand keeps the plain default style. A brand whose mark is missing or not
   * an image of its own gets a cover without a signature, never a failed one.
   */
  async resolveCoverStyle(
    brandId: string | null | undefined,
    organizationId: string,
    variant: WatermarkVariant = 'default',
  ): Promise<ICoverStyle | undefined> {
    if (!brandId) return undefined;
    const brand = await this.prisma.brand.findFirst({
      select: {
        fontFamily: true,
        primaryColor: true,
        watermarkInsetXRatio: true,
        watermarkInsetYRatio: true,
        watermarkLightLogoId: true,
        watermarkLiveLogoId: true,
        watermarkLogoId: true,
        watermarkOpacity: true,
        watermarkPosition: true,
        watermarkSizeRatio: true,
        watermarkText: true,
      },
      where: { id: brandId, isDeleted: false, organizationId },
    });
    if (!brand) return undefined;

    const logoId = watermarkLogoIdFor(brand, variant);
    const logo = logoId
      ? await this.prisma.asset.findFirst({
          select: {
            category: true,
            cloudObjectKey: true,
            id: true,
            mimeType: true,
          },
          where: {
            id: logoId,
            isDeleted: false,
            parentBrandId: brandId,
            parentOrgId: organizationId,
            parentType: 'BRAND',
          },
        })
      : null;
    const logoStorageKey = logo?.mimeType?.startsWith('image/')
      ? (logo.cloudObjectKey ??
        (logo.category === 'LOGO' ? `logos/${logo.id}` : undefined))
      : undefined;

    return {
      signature: buildCoverSignature(brand, logoStorageKey),
      title: buildCoverTitleStyle(brand),
    };
  }
}
