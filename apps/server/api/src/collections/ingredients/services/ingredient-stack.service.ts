import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { Prisma } from '@genfeedai/prisma';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

/** A carousel as the Library shows it: one cover tile and the count behind it. */
export interface IngredientStackSummary {
  /** The post whose ordered media is the stack. */
  postId: string;
  /** Slides in the stack, cover included. */
  count: number;
}

/**
 * The first slide of a post is the cover; every later slide is hidden behind it.
 * A deleted post owns no stack, so its media stays loose.
 */
const SLIDE_LINK: Prisma.PostIngredientWhereInput = {
  position: { gt: 0 },
  post: { isDeleted: false },
};

/**
 * Library stacks: the ordered media of a multi-image post, shown as one tile.
 *
 * The stack is derived from the post's own media order (`PostIngredient`
 * `position`), so it exists for every carousel already imported or published
 * and for every future one, with nothing to backfill and nothing that can
 * drift from the post. An asset that is a later slide of any live post is
 * folded behind that post's cover. The list filter and the per-row summary
 * read the same rule.
 */
@Traced()
@Injectable()
export class IngredientStackService {
  constructor(private readonly prisma: PrismaService) {}

  /** Hides later slides from the list; empty when stacking is not asked for. */
  buildFilter(isStacked: boolean | undefined): Prisma.IngredientWhereInput {
    return isStacked ? { postLinks: { none: SLIDE_LINK } } : {};
  }

  /** Puts `stack` on every cover of a list page; the page is untouched unless stacking was asked for. */
  async attachToPage<T extends { id: string }>(
    page: { docs: T[] },
    organizationId: string | undefined,
    isStacked: boolean | undefined,
  ): Promise<{ docs: (T & { stack?: IngredientStackSummary | null })[] }> {
    if (!isStacked) {
      return page;
    }
    const stacks = await this.summarize(
      organizationId,
      page.docs.map((doc) => doc.id),
    );
    return {
      ...page,
      docs: page.docs.map((doc) => ({
        ...doc,
        stack: stacks.get(doc.id) ?? null,
      })),
    };
  }

  /**
   * The stack each asset covers. An asset covering several posts takes the
   * earliest one, so a cover keeps one stable stack.
   */
  async summarize(
    organizationId: string | undefined,
    ingredientIds: readonly string[],
  ): Promise<Map<string, IngredientStackSummary>> {
    const summary = new Map<string, IngredientStackSummary>();
    if (!organizationId || ingredientIds.length === 0) {
      return summary;
    }
    const covers = await this.prisma.postIngredient.findMany({
      orderBy: { post: { createdAt: 'asc' } },
      select: { ingredientId: true, postId: true },
      where: {
        ingredientId: { in: [...ingredientIds] },
        organizationId,
        position: 0,
        post: { is: { isDeleted: false } },
      },
    });
    const postIds = [...new Set(covers.map((cover) => cover.postId))];
    if (postIds.length === 0) {
      return summary;
    }
    const sizes = await this.prisma.postIngredient.groupBy({
      _count: { _all: true },
      by: ['postId'],
      where: { organizationId, postId: { in: postIds } },
    });
    const sizeByPost = new Map(
      sizes.map((size) => [size.postId, size._count._all]),
    );
    for (const cover of covers) {
      const count = sizeByPost.get(cover.postId) ?? 0;
      if (count > 1 && !summary.has(cover.ingredientId)) {
        summary.set(cover.ingredientId, { count, postId: cover.postId });
      }
    }
    return summary;
  }

  /**
   * The ordered slide ids of the stack an asset belongs to, cover first: the
   * earliest live post that has the asset among two or more media. Empty when
   * the asset is not part of a carousel.
   */
  async findSlideIds(
    organizationId: string,
    ingredientId: string,
  ): Promise<string[]> {
    const links = await this.prisma.postIngredient.findMany({
      orderBy: { post: { createdAt: 'asc' } },
      select: { postId: true },
      where: {
        ingredientId,
        organizationId,
        post: { is: { isDeleted: false } },
      },
    });
    for (const { postId } of links) {
      const slides = await this.prisma.postIngredient.findMany({
        orderBy: { position: 'asc' },
        select: { ingredientId: true },
        where: { organizationId, postId },
      });
      if (slides.length > 1) {
        return slides.map((slide) => slide.ingredientId);
      }
    }
    return [];
  }
}
