import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  BRAND_VISION_CAPABILITY_BY_KIND,
  type BrandVisionModelKind,
} from '@genfeedai/contracts/constants';
import type {
  IBrandVisionModelOption,
  IBrandVisionModelOptions,
} from '@genfeedai/contracts/interfaces';
import { Injectable } from '@nestjs/common';

/** `owner/name:version`, the immutable Replicate version a prediction runs. */
const PINNED_REPLICATE_IDENTIFIER = /^[^\s/:]+\/[^\s/:]+:[A-Za-z0-9]+$/;
const PER_SECOND = 'per-second';

const BRAND_VISION_MODEL_SELECT = {
  externalId: true,
  key: true,
  label: true,
  pricingType: true,
  providerCostUsd: true,
} as const;

interface CatalogRow {
  externalId: string | null;
  key: string;
  label: string;
  pricingType: string | null;
  providerCostUsd: number | null;
}

/**
 * A catalog row is only usable for brand visual analysis when it names an
 * immutable version and a per-second price: the provider runs the version and
 * records exactly the price on the row. Anything less fails closed.
 */
function toOption(row: CatalogRow): IBrandVisionModelOption | null {
  if (
    !row.externalId ||
    !PINNED_REPLICATE_IDENTIFIER.test(row.externalId) ||
    row.pricingType !== PER_SECOND ||
    typeof row.providerCostUsd !== 'number' ||
    !Number.isFinite(row.providerCostUsd) ||
    row.providerCostUsd <= 0
  )
    return null;
  return {
    externalId: row.externalId,
    key: row.key,
    label: row.label,
    pricingType: row.pricingType,
    providerCostUsd: row.providerCostUsd,
  };
}

/**
 * The model catalog as the brand visual analysis settings see it (#6727): the
 * active, platform-owned Replicate rows tagged with a job's capability that
 * name a pinned version and a per-second price. The platform setting stores a
 * `Model.key`; this resolves it, and lists what an operator may pick.
 */
@Injectable()
export class BrandVisionModelCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /** The usable catalog row for `key`, or null when it is unset, unknown or unusable. */
  async resolve(
    kind: BrandVisionModelKind,
    key: string | null | undefined,
  ): Promise<IBrandVisionModelOption | null> {
    const trimmed = key?.trim();
    if (!trimmed) return null;
    // tenant-scope-ignore: the platform catalog (organizationId null) is shared by every tenant; `key` is its unique index
    const row = await this.prisma.model.findFirst({
      select: BRAND_VISION_MODEL_SELECT,
      where: {
        ...this.eligibleWhere(kind),
        key: trimmed,
      },
    });
    return row ? toOption(row) : null;
  }

  async list(): Promise<IBrandVisionModelOptions> {
    const [ocr, detect] = await Promise.all([
      this.listKind('ocr'),
      this.listKind('detect'),
    ]);
    return { detect, id: 'brand-vision-models', ocr };
  }

  private async listKind(
    kind: BrandVisionModelKind,
  ): Promise<IBrandVisionModelOption[]> {
    // tenant-scope-ignore: the platform catalog (organizationId null) is shared by every tenant
    const rows = await this.prisma.model.findMany({
      orderBy: { label: 'asc' },
      select: BRAND_VISION_MODEL_SELECT,
      where: this.eligibleWhere(kind),
    });
    return rows.flatMap((row) => {
      const option = toOption(row);
      return option ? [option] : [];
    });
  }

  private eligibleWhere(kind: BrandVisionModelKind) {
    return {
      capabilities: { has: BRAND_VISION_CAPABILITY_BY_KIND[kind] },
      isActive: true,
      isDeleted: false,
      organizationId: null,
      provider: 'replicate',
    };
  }
}
