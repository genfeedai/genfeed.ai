import type { IIngredient } from '@genfeedai/interfaces';
export declare function isAvatarIngredient(
  ingredient: IIngredient | null | undefined,
): boolean;
export declare function isAvatarSourceImageIngredient(
  ingredient: IIngredient | null | undefined,
): boolean;
export declare function isAvatarVideoIngredient(
  ingredient: IIngredient | null | undefined,
): boolean;
export declare function isVideoIngredient(
  ingredient: IIngredient | null | undefined,
): boolean;
export declare function isImageIngredient(
  ingredient: IIngredient | null | undefined,
): boolean;
export declare function getIngredientExtension(ingredient: IIngredient): string;
export declare function getIngredientDisplayLabel(
  ingredient: IIngredient | null | undefined,
): string;
//# sourceMappingURL=ingredient-type.util.d.ts.map
