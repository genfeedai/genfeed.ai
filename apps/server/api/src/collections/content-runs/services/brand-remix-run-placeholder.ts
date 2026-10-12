import { scopedWhere } from '@api/index';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { BrandRemixRunConfig } from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import { ConflictException } from '@nestjs/common';

export interface BrandRemixPlaceholderBinding {
  brandId: string;
  config: BrandRemixRunConfig;
  groupIndex: number;
  ingredientId: string;
  organizationId: string;
  recipeRevision: number;
  runId: string;
}

/**
 * A Library output made from a saved browser source records that source (and
 * its prepared media) in the existing `sources` lineage, so the Library can
 * show where the output came from. The original stays unchanged.
 */
export async function linkImportedSourceLineage(
  prisma: PrismaService,
  params: Pick<
    BrandRemixPlaceholderBinding,
    'brandId' | 'config' | 'ingredientId' | 'organizationId'
  >,
): Promise<void> {
  const { selector, media } = params.config.sourceSnapshot;
  if (selector.kind !== 'imported_source') return;
  const sourceIds = [
    selector.importedSourceId,
    ...(media?.status === 'saved' ? [media.assetId] : []),
  ];
  const sources = await prisma.ingredient.findMany({
    select: { id: true },
    where: scopedWhere(params.organizationId, {
      brandId: params.brandId,
      id: { in: sourceIds },
    }),
  });
  if (!sources.some((source) => source.id === selector.importedSourceId)) {
    throw new ConflictException(
      'The imported source is no longer available for this remix.',
    );
  }
  await prisma.ingredient.update({
    data: { sources: { connect: sources.map(({ id }) => ({ id })) } },
    where: {
      id: params.ingredientId,
      isDeleted: false,
      organizationId: params.organizationId,
    },
  });
}

/**
 * Binds a run-scoped placeholder to the remix revision before any provider
 * call, and links it to its saved source when it has one.
 */
export async function bindPlaceholderToRemix(
  prisma: PrismaService,
  params: BrandRemixPlaceholderBinding,
): Promise<void> {
  const tagged = await prisma.ingredient.updateMany({
    data: { templateVersion: params.recipeRevision },
    where: scopedWhere(params.organizationId, {
      brandId: params.brandId,
      groupId: params.runId,
      groupIndex: params.groupIndex,
      id: params.ingredientId,
    }),
  });
  if (tagged.count !== 1) {
    throw new ConflictException(
      'The generated placeholder could not be bound to this remix revision.',
    );
  }
  await linkImportedSourceLineage(prisma, params);
}
