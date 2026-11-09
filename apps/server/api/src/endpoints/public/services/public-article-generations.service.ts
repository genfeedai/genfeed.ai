import { CategoryPrismaUtil } from '@api/helpers/utils/category-prisma/category-prisma.util';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  AssetScope,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

/** Enough blocks for a long tutorial; a page never fans out further. */
const MAX_GENERATION_BLOCKS = 24;

const GENERATION_FIGURE_PATTERN = /<figure\b[^>]*>/gi;
const KIND_PATTERN = /\bdata-genfeed-generation\s*=\s*(["'])(image|video)\1/i;
const INGREDIENT_ID_PATTERN = /\bdata-ingredient-id\s*=\s*(["'])([\w-]+)\1/i;
const HIDDEN_PROMPT_PATTERN = /\bdata-prompt\s*=\s*(["'])hidden\1/i;

export interface ArticleGenerationRef {
  ingredientId: string;
  isPromptShown: boolean;
}

/**
 * The generation blocks an article's body embeds, in reading order, one per
 * asset. A block whose prompt is hidden keeps it hidden even when the same
 * asset is embedded again with its prompt shown.
 */
export function findArticleGenerationRefs(
  content: string | null | undefined,
): ArticleGenerationRef[] {
  const refs = new Map<string, ArticleGenerationRef>();
  for (const [tag] of (content ?? '').matchAll(GENERATION_FIGURE_PATTERN)) {
    const ingredientId = tag.match(INGREDIENT_ID_PATTERN)?.[2];
    if (!KIND_PATTERN.test(tag) || !ingredientId) {
      continue;
    }
    const isPromptShown = !HIDDEN_PROMPT_PATTERN.test(tag);
    const known = refs.get(ingredientId);
    refs.set(ingredientId, {
      ingredientId,
      isPromptShown: known
        ? known.isPromptShown && isPromptShown
        : isPromptShown,
    });
  }
  return [...refs.values()].slice(0, MAX_GENERATION_BLOCKS);
}

const GENERATION_SELECT = {
  category: true,
  id: true,
  metadata: {
    select: {
      description: true,
      height: true,
      id: true,
      label: true,
      model: true,
      width: true,
    },
  },
  prompt: { select: { id: true, original: true } },
  status: true,
} satisfies Prisma.IngredientSelect;

export type ArticleGeneration = Prisma.IngredientGetPayload<{
  select: typeof GENERATION_SELECT;
}>;

/**
 * The generations a public article embeds. Only the article's own
 * organization's assets that are already public and finished come back: the
 * article never makes an asset public, and an id from another organization
 * resolves to nothing. A prompt the author hid is left out.
 */
@Traced()
@Injectable()
export class PublicArticleGenerationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findForArticle(
    articleId: string,
    publicWhere: Prisma.ArticleWhereInput,
  ): Promise<ArticleGeneration[]> {
    // tenant-scope-ignore: public article read; publicWhere pins published, live articles, and the asset read below is org-scoped.
    const article = await this.prisma.article.findFirst({
      select: { content: true, organizationId: true },
      where: { ...publicWhere, id: articleId, isDeleted: false },
    });
    const refs = findArticleGenerationRefs(article?.content);
    if (!article || refs.length === 0) {
      return [];
    }

    const ingredients = await this.prisma.ingredient.findMany({
      select: GENERATION_SELECT,
      where: scopedWhere(article.organizationId, {
        category: {
          in: [
            CategoryPrismaUtil.toIngredientCategory(IngredientCategory.IMAGE),
            CategoryPrismaUtil.toIngredientCategory(IngredientCategory.VIDEO),
          ],
        },
        id: { in: refs.map((ref) => ref.ingredientId) },
        OR: [
          { isPublic: true },
          { scope: CategoryPrismaUtil.toAssetScope(AssetScope.PUBLIC) },
        ],
        status: CategoryPrismaUtil.toIngredientStatus(
          IngredientStatus.GENERATED,
        ),
      }),
    });

    const byId = new Map(ingredients.map((item) => [item.id, item]));
    return refs.flatMap((ref) => {
      const ingredient = byId.get(ref.ingredientId);
      if (!ingredient) {
        return [];
      }
      return [ref.isPromptShown ? ingredient : { ...ingredient, prompt: null }];
    });
  }
}
