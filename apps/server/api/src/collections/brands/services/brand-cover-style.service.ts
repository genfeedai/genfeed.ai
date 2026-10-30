import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { ICoverTitleStyle } from '@genfeedai/contracts/interfaces';
import { Injectable } from '@nestjs/common';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
/** WCAG contrast an accent needs against the near-black cover scrim. */
const MIN_ACCENT_CONTRAST = 3;

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

/** Looks up a brand and turns its settings into a cover title style. */
@Injectable()
export class BrandCoverStyleService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `undefined` when there is no brand or it is not in the organization, so a
   * cover without a brand keeps the plain default style.
   */
  async resolveTitleStyle(
    brandId: string | null | undefined,
    organizationId: string,
  ): Promise<ICoverTitleStyle | undefined> {
    if (!brandId) return undefined;
    const brand = await this.prisma.brand.findFirst({
      select: { fontFamily: true, primaryColor: true },
      where: { id: brandId, isDeleted: false, organizationId },
    });
    return brand ? buildCoverTitleStyle(brand) : undefined;
  }
}
