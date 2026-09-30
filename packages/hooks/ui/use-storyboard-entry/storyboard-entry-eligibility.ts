import {
  AssetScope,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';

export function isStoryboardEntryAsset(ingredient: IIngredient): boolean {
  return (
    !ingredient.isDeleted &&
    ingredient.scope === AssetScope.USER &&
    [
      IngredientStatus.UPLOADED,
      IngredientStatus.GENERATED,
      IngredientStatus.VALIDATED,
    ].includes(ingredient.status) &&
    [
      IngredientCategory.IMAGE,
      IngredientCategory.IMAGE_EDIT,
      IngredientCategory.VIDEO,
    ].includes(ingredient.category)
  );
}

export function isOwnedStoryboardEntryAsset(
  ingredient: IIngredient,
  organizationId: string,
  brandId: string,
): boolean {
  const ingredientOrg =
    ingredient.organizationId ??
    (typeof ingredient.organization === 'string'
      ? ingredient.organization
      : ingredient.organization?.id);
  const ingredientBrand =
    ingredient.brandId ??
    (typeof ingredient.brand === 'string'
      ? ingredient.brand
      : ingredient.brand?.id);
  return Boolean(
    organizationId &&
      brandId &&
      isStoryboardEntryAsset(ingredient) &&
      ingredientOrg === organizationId &&
      ingredientBrand === brandId,
  );
}
