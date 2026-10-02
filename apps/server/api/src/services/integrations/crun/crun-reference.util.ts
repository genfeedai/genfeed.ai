import type { AssetsService } from '@api/collections/assets/services/assets.service';
import type { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { scopedWhere } from '@api/index';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  AssetCategory,
  AssetParent,
  IngredientCategory,
} from '@genfeedai/contracts';
import type { ConfigService } from '@libs/config/config.service';

interface CrunReferenceContext {
  prisma: PrismaService;
  assets: AssetsService;
  ingredients: IngredientsService;
  config: ConfigService;
  userId: string;
  organizationId: string;
  brandId: string;
  referenceIds: readonly string[];
  mode: 'image' | 'video-frame';
}
export interface CrunResolvedReference {
  id: string;
  url: string;
  kind: 'image-ingredient' | 'video-thumbnail' | 'reference-asset';
}

async function resolveReference(
  context: CrunReferenceContext,
  id: string,
): Promise<CrunResolvedReference | null> {
  const {
    prisma,
    assets,
    ingredients,
    config,
    userId,
    organizationId,
    brandId,
    mode,
  } = context;
  const image = await ingredients.findOne({
    id,
    organizationId,
    isDeleted: false,
    category: IngredientCategory.IMAGE,
    ...(mode === 'video-frame' ? { brandId } : {}),
  });
  if (image)
    return {
      id,
      url: `${config.ingredientsEndpoint}/images/${image.id}`,
      kind: 'image-ingredient',
    };
  if (mode === 'image') {
    const video = await ingredients.findOne({
      id,
      organizationId,
      isDeleted: false,
      category: IngredientCategory.VIDEO,
    });
    if (video)
      return {
        id,
        url: `${config.ingredientsEndpoint}/thumbnails/${video.id}`,
        kind: 'video-thumbnail',
      };
  }
  const asset = await assets.findOne({
    id,
    userId,
    isDeleted: false,
    category: AssetCategory.REFERENCE,
  });
  if (!asset?.mimeType?.startsWith('image/')) return null;
  if (asset.parentOrgId && asset.parentOrgId !== organizationId) return null;
  if (asset.parentType !== AssetParent.INGREDIENT && asset.parentIngredientId)
    return null;
  if (asset.parentType !== AssetParent.ARTICLE && asset.parentArticleId)
    return null;
  let parentBrand: string | null | undefined;
  if (asset.parentType === AssetParent.BRAND) {
    if (
      !asset.parentBrandId ||
      (mode === 'video-frame' && asset.parentBrandId !== brandId)
    )
      return null;
    const parent = await prisma.brand.findFirst({
      where: { id: asset.parentBrandId, organizationId, isDeleted: false },
      select: { id: true },
    });
    if (!parent) return null;
    parentBrand = parent.id;
  } else if (asset.parentType === AssetParent.ORGANIZATION) {
    if (
      asset.parentOrgId !== organizationId ||
      !(await prisma.organization.findFirst({
        where: { id: organizationId, isDeleted: false },
        select: { id: true },
      }))
    )
      return null;
  } else if (asset.parentType === AssetParent.INGREDIENT) {
    if (!asset.parentIngredientId) return null;
    const parent = await prisma.ingredient.findFirst({
      where: scopedWhere(organizationId, {
        id: asset.parentIngredientId,
        organizationId,
        isDeleted: false,
        ...(mode === 'video-frame' ? { brandId } : {}),
      }),
      select: { brandId: true },
    });
    if (!parent) return null;
    parentBrand = parent.brandId;
  } else if (asset.parentType === AssetParent.ARTICLE) {
    if (!asset.parentArticleId) return null;
    const parent = await prisma.article.findFirst({
      where: scopedWhere(organizationId, {
        id: asset.parentArticleId,
        organizationId,
        isDeleted: false,
        ...(mode === 'video-frame' ? { brandId } : {}),
      }),
      select: { brandId: true },
    });
    if (!parent) return null;
    parentBrand = parent.brandId;
  } else return null;
  if (asset.parentBrandId) {
    if (parentBrand !== undefined && asset.parentBrandId !== parentBrand)
      return null;
    if (mode === 'video-frame' && asset.parentBrandId !== brandId) return null;
    if (
      asset.parentType !== AssetParent.BRAND &&
      !(await prisma.brand.findFirst({
        where: { id: asset.parentBrandId, organizationId, isDeleted: false },
        select: { id: true },
      }))
    )
      return null;
  }
  return {
    id: asset.id,
    url: `${config.cdnUrl}/references/${asset.id}`,
    kind: 'reference-asset',
  };
}

export async function resolveCrunReferences(
  context: CrunReferenceContext,
): Promise<CrunResolvedReference[] | null> {
  const cache = new Map<string, CrunResolvedReference | null>();
  const resolved: CrunResolvedReference[] = [];
  try {
    for (const id of context.referenceIds) {
      if (!cache.has(id)) cache.set(id, await resolveReference(context, id));
      const reference = cache.get(id);
      if (!reference) return null;
      resolved.push(reference);
    }
    return resolved;
  } catch {
    return null;
  }
}
