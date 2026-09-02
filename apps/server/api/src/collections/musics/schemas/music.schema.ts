/**
 * Musics are `ingredient` rows — `MusicsService` extends `BaseService` over the
 * same table `IngredientsService` does. Both must therefore agree on the row
 * shape: `IngredientDocument`, not the raw Prisma `Ingredient`. Rows crossing
 * the service layer are routinely partial and populated, which is exactly the
 * widening `IngredientDocument` encodes (notably optional `scope`).
 *
 * Aliasing this to `Ingredient` split the two services over one table and made
 * every ingredient-shaped value unassignable on the musics side.
 * @see ../../ingredients/schemas/ingredient.schema.ts
 */
export type { IngredientDocument as MusicDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
