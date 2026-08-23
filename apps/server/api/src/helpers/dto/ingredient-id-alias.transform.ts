import type { QueryAliasResolver } from '@api/helpers/pipes/validation.pipe';

/**
 * Accept the client's JSON:API relationship name `ingredient` on a DTO that
 * declares `ingredientId`.
 *
 * Caption create posts `{ ingredient: <id> }` (the Caption model field). The
 * DTO declares the Prisma scalar `ingredientId`. With `{ whitelist: true }`
 * the undeclared `ingredient` key is deleted, `@IsEntityId()` fails, and
 * Generate Caption 400s before Whisper runs.
 */
export const resolveIngredientIdAlias: QueryAliasResolver = (
  source,
  instance,
): void => {
  const target = instance as { ingredientId?: string };
  if (typeof target.ingredientId === 'string' && target.ingredientId !== '') {
    return;
  }

  const alias = source.ingredient;
  if (typeof alias === 'string' && alias !== '') {
    target.ingredientId = alias;
    return;
  }

  if (
    alias &&
    typeof alias === 'object' &&
    'id' in alias &&
    typeof alias.id === 'string' &&
    alias.id !== ''
  ) {
    target.ingredientId = alias.id;
  }
};
