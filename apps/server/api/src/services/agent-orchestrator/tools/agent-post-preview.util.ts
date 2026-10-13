import { orderedPostIngredientLinks } from '@api/collections/posts/services/post-ingredient-links.util';
import type { PopulateOption } from '@genfeedai/contracts/interfaces';

const INGREDIENT_FIELDS = [
  'id',
  'category',
  'cdnUrl',
  's3Key',
  'organizationId',
  'isDeleted',
] as const;
const ACCOUNT_FIELDS = [
  'id',
  'platform',
  'label',
  'externalName',
  'externalHandle',
  'externalAvatar',
  'organizationId',
  'brandId',
  'isDeleted',
] as const;
const selectFields = (fields: readonly string[]) =>
  Object.fromEntries(fields.map((field) => [field, true]));

export function agentPostPreviewInclude(organizationId: string) {
  return {
    ingredientLinks: orderedPostIngredientLinks(
      { select: selectFields(INGREDIENT_FIELDS) },
      { organizationId, isDeleted: false },
    ),
    credential: {
      where: { organizationId, isDeleted: false },
      select: selectFields(ACCOUNT_FIELDS),
    },
  };
}

export function agentPostPreviewPopulate(
  organizationId: string,
): PopulateOption[] {
  return [
    {
      path: 'ingredients',
      where: { organizationId, isDeleted: false },
      select: INGREDIENT_FIELDS,
    },
    {
      path: 'credential',
      where: { organizationId, isDeleted: false },
      select: ACCOUNT_FIELDS,
    },
  ];
}
