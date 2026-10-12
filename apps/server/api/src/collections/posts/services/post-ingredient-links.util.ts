import type { Prisma } from '@genfeedai/prisma';

/**
 * A post's media is stored as ordered `PostIngredient` links (#6740): the
 * `position` is the slide order the user arranged, written from the order of
 * the `ingredients` id array. Every read orders by it, so a carousel publishes,
 * previews and edits in the order it was arranged.
 *
 * API consumers still see `post.ingredients` as an ordered array of media;
 * these helpers translate between that shape and the link rows.
 */

/** Slide order: the arranged position, with the link id as a stable tiebreak. */
export const POST_INGREDIENT_LINK_ORDER = [
  { position: 'asc' },
  { id: 'asc' },
] as const satisfies Prisma.PostIngredientOrderByWithRelationInput[];

type IngredientSelection = NonNullable<
  Prisma.PostIngredientInclude['ingredient']
>;

/**
 * The `ingredientLinks` relation argument that loads a post's media in slide
 * order. `ingredient` narrows the loaded media (`{ select: { id: true } }`) and
 * `ingredientWhere` filters the links by their media.
 */
export function orderedPostIngredientLinks<
  const I extends IngredientSelection = true,
>(
  ingredient?: I,
  ingredientWhere?: Prisma.IngredientWhereInput,
): {
  include: { ingredient: I };
  orderBy: Prisma.PostIngredientOrderByWithRelationInput[];
  where?: Prisma.PostIngredientWhereInput;
} {
  return {
    include: { ingredient: (ingredient ?? true) as I },
    orderBy: [...POST_INGREDIENT_LINK_ORDER],
    ...(ingredientWhere ? { where: { ingredient: ingredientWhere } } : {}),
  };
}

/** Distinct ids in the order first given: a media item appears once per post. */
export function distinctIngredientIds(ids: readonly string[]): string[] {
  return [...new Set(ids.map((id) => String(id)))];
}

/** Link rows for `ids`, positioned by their order in the array. */
export function postIngredientLinkRows(
  organizationId: string,
  ids: readonly string[],
): Prisma.PostIngredientUncheckedCreateWithoutPostInput[] {
  return distinctIngredientIds(ids).map((ingredientId, position) => ({
    ingredientId,
    organizationId,
    position,
  }));
}

/** Nested write that creates a new post's links in the order given. */
export function createPostIngredientLinks(
  organizationId: string,
  ids: readonly string[],
): { create: Prisma.PostIngredientUncheckedCreateWithoutPostInput[] } {
  return { create: postIngredientLinkRows(organizationId, ids) };
}

/** Nested write that replaces a post's links with `ids`, in the order given. */
export function replacePostIngredientLinks(
  organizationId: string,
  ids: readonly string[],
): {
  create: Prisma.PostIngredientUncheckedCreateWithoutPostInput[];
  deleteMany: Record<string, never>;
} {
  return {
    create: postIngredientLinkRows(organizationId, ids),
    deleteMany: {},
  };
}

type IngredientLinkRow = { ingredient: unknown };

/**
 * A loaded post with its `ingredientLinks` replaced by the ordered
 * `ingredients`; a row type without links is unchanged.
 */
export type WithFlattenedIngredients<P> = P extends {
  ingredientLinks: infer L extends readonly IngredientLinkRow[];
}
  ? Omit<P, 'ingredientLinks'> & { ingredients: L[number]['ingredient'][] }
  : P;

type WithFlattenedPostTree<P> = P extends {
  children: infer C extends readonly object[];
}
  ? Omit<WithFlattenedIngredients<P>, 'children'> & {
      children: WithFlattenedIngredients<C[number]>[];
    }
  : WithFlattenedIngredients<P>;

/**
 * Replaces a loaded post's `ingredientLinks` with the ordered `ingredients`
 * array the API contract exposes. A row loaded without its links is returned
 * unchanged.
 */
export function flattenPostIngredients<P extends object>(
  post: P,
): WithFlattenedIngredients<P> {
  const { ingredientLinks, ...rest } = post as P & {
    ingredientLinks?: readonly Partial<IngredientLinkRow>[] | null;
  };
  if (!Array.isArray(ingredientLinks)) {
    return post as WithFlattenedIngredients<P>;
  }
  return {
    ...rest,
    ingredients: ingredientLinks
      .map((link) => link.ingredient)
      .filter((ingredient) => ingredient !== undefined && ingredient !== null),
  } as unknown as WithFlattenedIngredients<P>;
}

/** `flattenPostIngredients` for a post and each of its loaded child posts. */
export function flattenPostTreeIngredients<
  P extends { children: readonly object[] },
>(post: P): WithFlattenedPostTree<P> {
  return {
    ...flattenPostIngredients(post),
    children: post.children.map((child) => flattenPostIngredients(child)),
  } as unknown as WithFlattenedPostTree<P>;
}

/**
 * `flattenPostTreeIngredients` for a row of unknown shape: media are flattened
 * on the post and, when loaded, on each child post.
 */
export function flattenLoadedPostIngredients(document: unknown): unknown {
  if (document === null || typeof document !== 'object') {
    return document;
  }
  const flattened = flattenPostIngredients(document);
  const children = (flattened as { children?: unknown }).children;
  return Array.isArray(children)
    ? { ...flattened, children: children.map(flattenLoadedPostIngredients) }
    : flattened;
}

/** The media ids of a loaded post, in slide order. */
export function postIngredientIds(post: {
  ingredientLinks?: readonly { ingredientId: string }[] | null;
}): string[] {
  return (post.ingredientLinks ?? []).map((link) => link.ingredientId);
}
