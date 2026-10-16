import type { ApplyBrandKitDto } from '@api/collections/brands/dto/apply-brand-kit.dto';
import type { UpdateBrandDto } from '@api/collections/brands/dto/update-brand.dto';
import type { BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import { BrandKitAssetsService } from '@api/collections/brands/services/brand-kit-assets.service';
import {
  type BrandKitApplyEffects,
  type BrandKitApplySocialLink,
  BrandKitDraftService,
} from '@api/collections/brands/services/brand-kit-draft.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { assertUrlNotPrivate } from '@api/helpers/utils/ssrf/ssrf.util';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LinkCategory } from '@genfeedai/contracts';
import type {
  IBrandKitApplyResult,
  IBrandKitAssetImportCandidate,
  IBrandKitAssetImportResponse,
} from '@genfeedai/contracts/interfaces';

const SOCIAL_LINK_CATEGORIES: Record<string, LinkCategory> = {
  facebook: LinkCategory.FACEBOOK,
  instagram: LinkCategory.INSTAGRAM,
  linkedin: LinkCategory.LINKEDIN,
  tiktok: LinkCategory.TIKTOK,
  twitter: LinkCategory.TWITTER,
  x: LinkCategory.TWITTER,
  youtube: LinkCategory.YOUTUBE,
};

const SOCIAL_LINK_LABELS: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  twitter: 'Twitter',
  x: 'Twitter',
  youtube: 'YouTube',
};

type BrandKitApplyBrandFinder = (
  criteria: Record<string, unknown>,
) => Promise<BrandDocument | null>;

type BrandKitApplyWriter = (
  brandId: string,
  organizationId: string,
  updates: Partial<UpdateBrandDto>,
  expectedAgentConfig: BrandDocument['agentConfig'],
) => Promise<BrandDocument>;

export interface ApplyScannedBrandKitDraftInput {
  assets: BrandKitAssetsService;
  brandId: string;
  draftService: BrandKitDraftService;
  dto: ApplyBrandKitDto;
  findBrand: BrandKitApplyBrandFinder;
  findOwnedBrand: BrandKitApplyBrandFinder;
  organizationId: string;
  prisma: PrismaService;
  userId?: string;
  writeBrand: BrandKitApplyWriter;
}

export function applyScannedBrandKitDraft(
  input: ApplyScannedBrandKitDraftInput,
): Promise<IBrandKitApplyResult> {
  const effects: BrandKitApplyEffects = {
    saveSocialLinks: (links) =>
      saveAppliedBrandKitSocialLinks(
        input.prisma,
        input.brandId,
        input.organizationId,
        links,
      ),
  };

  if (input.userId) {
    const userId = input.userId;
    effects.importLogo = (candidate) =>
      importAppliedBrandKitLogo(
        input.assets,
        input.findOwnedBrand,
        input.brandId,
        input.organizationId,
        userId,
        candidate,
      );
  }

  return input.draftService.applyBrandKitDraft(
    input.brandId,
    input.organizationId,
    input.dto,
    input.findBrand,
    input.writeBrand,
    effects,
  );
}

export function importAppliedBrandKitLogo(
  assets: BrandKitAssetsService,
  findBrand: BrandKitApplyBrandFinder,
  brandId: string,
  organizationId: string,
  userId: string,
  candidate: IBrandKitAssetImportCandidate,
): Promise<IBrandKitAssetImportResponse> {
  return assets.importBrandKitAssets(
    brandId,
    organizationId,
    userId,
    { assets: [candidate] },
    findBrand,
  );
}

export async function saveAppliedBrandKitSocialLinks(
  prisma: PrismaService,
  brandId: string,
  organizationId: string,
  links: readonly BrandKitApplySocialLink[],
): Promise<readonly BrandKitApplySocialLink[]> {
  const brand = await prisma.brand.findFirst({
    select: { id: true },
    where: scopedWhere(organizationId, { id: brandId }),
  });
  if (!brand) {
    throw new NotFoundException('Brand', brandId);
  }

  const saved: BrandKitApplySocialLink[] = [];

  for (const link of links) {
    const platform = link.platform.trim().toLowerCase();
    const category = SOCIAL_LINK_CATEGORIES[platform];
    const url = link.url.trim();
    if (!category || !/^https?:\/\//iu.test(url)) {
      continue;
    }

    try {
      assertUrlNotPrivate(url);
    } catch {
      continue;
    }

    const label = link.label?.trim() || SOCIAL_LINK_LABELS[platform];
    const persisted: BrandKitApplySocialLink = { label, platform, url };
    const lockKey = JSON.stringify(['brand-social-link', brandId, category]);
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text`;
      const existing = await tx.link.findFirst({
        orderBy: { createdAt: 'asc' },
        where: { brandId, category, isDeleted: false },
      });
      if (existing) {
        await tx.link.update({
          data: { label, url },
          where: { id: existing.id },
        });
        return;
      }

      await tx.link.create({
        data: { brandId, category, label, url },
      });
    });
    saved.push(persisted);
  }

  return saved;
}
