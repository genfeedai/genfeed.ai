import { IngredientCategory, OrganizationCategory } from '@genfeedai/enums';
import { BadRequestException } from '@nestjs/common';

/**
 * Prisma UPPERCASE enum values for IngredientCategory.
 * These string literals must match the Prisma schema exactly.
 */
export type PrismaIngredientCategoryValue =
  | 'IMAGE'
  | 'VIDEO'
  | 'MUSIC'
  | 'GIF'
  | 'AVATAR'
  | 'AUDIO'
  | 'IMAGE_EDIT'
  | 'VIDEO_EDIT'
  | 'VOICE'
  | 'INGREDIENT'
  | 'TEXT'
  | 'SOURCE';

/**
 * Prisma UPPERCASE enum values for OrganizationCategory.
 * These string literals must match the Prisma schema exactly.
 */
export type PrismaOrganizationCategoryValue = 'CREATOR' | 'BUSINESS' | 'AGENCY';

/**
 * Explicit app→Prisma mapping for IngredientCategory.
 *
 * App-level enum values are lowercase (e.g. 'video'); Prisma requires UPPERCASE
 * (e.g. 'VIDEO'). The Prisma 7 PG driver adapter does not populate
 * `_runtimeDataModel` so BaseService.normalizeEnumScalarValue() cannot rescue
 * these values at runtime.  This map is the canonical, exhaustive boundary.
 *
 * If you add a member to @genfeedai/enums IngredientCategory you MUST add it
 * here too — the guard test in category-prisma.util.spec.ts will fail otherwise.
 */
const APP_TO_PRISMA_INGREDIENT_CATEGORY: Record<
  IngredientCategory,
  PrismaIngredientCategoryValue
> = {
  [IngredientCategory.IMAGE]: 'IMAGE',
  [IngredientCategory.VIDEO]: 'VIDEO',
  [IngredientCategory.MUSIC]: 'MUSIC',
  [IngredientCategory.GIF]: 'GIF',
  [IngredientCategory.AVATAR]: 'AVATAR',
  [IngredientCategory.AUDIO]: 'AUDIO',
  [IngredientCategory.IMAGE_EDIT]: 'IMAGE_EDIT',
  [IngredientCategory.VIDEO_EDIT]: 'VIDEO_EDIT',
  [IngredientCategory.VOICE]: 'VOICE',
  [IngredientCategory.INGREDIENT]: 'INGREDIENT',
  [IngredientCategory.TEXT]: 'TEXT',
  [IngredientCategory.SOURCE]: 'SOURCE',
};

/**
 * Explicit app→Prisma mapping for OrganizationCategory.
 *
 * If you add a member to @genfeedai/enums OrganizationCategory you MUST add it
 * here too — the guard test in category-prisma.util.spec.ts will fail otherwise.
 */
const APP_TO_PRISMA_ORGANIZATION_CATEGORY: Record<
  OrganizationCategory,
  PrismaOrganizationCategoryValue
> = {
  [OrganizationCategory.CREATOR]: 'CREATOR',
  [OrganizationCategory.BUSINESS]: 'BUSINESS',
  [OrganizationCategory.AGENCY]: 'AGENCY',
};

/**
 * The set of valid Prisma IngredientCategory UPPERCASE strings.
 * Used for idempotent passthrough of already-uppercased values.
 */
const PRISMA_INGREDIENT_CATEGORY_VALUES = new Set<string>(
  Object.values(APP_TO_PRISMA_INGREDIENT_CATEGORY),
);

/**
 * The set of valid Prisma OrganizationCategory UPPERCASE strings.
 * Used for idempotent passthrough of already-uppercased values.
 */
const PRISMA_ORGANIZATION_CATEGORY_VALUES = new Set<string>(
  Object.values(APP_TO_PRISMA_ORGANIZATION_CATEGORY),
);

export class CategoryPrismaUtil {
  /**
   * Map a single IngredientCategory app-enum value to its Prisma UPPERCASE form.
   *
   * - App-form values (lowercase, e.g. 'video') → mapped to 'VIDEO'.
   * - Already-Prisma-form values (UPPERCASE, e.g. 'VIDEO') → passed through
   *   idempotently.
   * - `undefined` / empty string → returns `undefined` (caller omits the filter).
   * - Non-empty unmappable value → throws BadRequestException.
   */
  static toIngredientCategory(
    value?: IngredientCategory | string,
  ): PrismaIngredientCategoryValue | undefined {
    if (value === undefined || value === '') {
      return undefined;
    }

    const mapped =
      APP_TO_PRISMA_INGREDIENT_CATEGORY[value as IngredientCategory];
    if (mapped !== undefined) {
      return mapped;
    }

    // Accept already-Prisma-form values for idempotent passthrough.
    if (PRISMA_INGREDIENT_CATEGORY_VALUES.has(value as string)) {
      return value as PrismaIngredientCategoryValue;
    }

    throw new BadRequestException(`Unknown IngredientCategory: ${value}`);
  }

  /**
   * Build a Prisma `where` fragment for a single IngredientCategory filter.
   * Returns `{}` when category is absent (caller spreads safely).
   */
  static toIngredientCategoryFilter(
    category?: IngredientCategory | string,
  ): Record<string, unknown> {
    if (category === undefined || category === '') {
      return {};
    }
    return { category: CategoryPrismaUtil.toIngredientCategory(category) };
  }

  /**
   * Map a single OrganizationCategory app-enum value to its Prisma UPPERCASE
   * form.
   *
   * - App-form values (lowercase, e.g. 'business') → mapped to 'BUSINESS'.
   * - Already-Prisma-form values (UPPERCASE, e.g. 'BUSINESS') → passed through
   *   idempotently.
   * - `undefined` / empty string → returns `undefined` (caller omits the field).
   * - Non-empty unmappable value → throws BadRequestException.
   */
  static toOrganizationCategory(
    value?: OrganizationCategory | string,
  ): PrismaOrganizationCategoryValue | undefined {
    if (value === undefined || value === '') {
      return undefined;
    }

    const mapped =
      APP_TO_PRISMA_ORGANIZATION_CATEGORY[value as OrganizationCategory];
    if (mapped !== undefined) {
      return mapped;
    }

    // Accept already-Prisma-form values for idempotent passthrough.
    if (PRISMA_ORGANIZATION_CATEGORY_VALUES.has(value as string)) {
      return value as PrismaOrganizationCategoryValue;
    }

    throw new BadRequestException(`Unknown OrganizationCategory: ${value}`);
  }

  /**
   * Build a Prisma `where` fragment for a single OrganizationCategory filter.
   * Returns `{}` when category is absent (caller spreads safely).
   */
  static toOrganizationCategoryFilter(
    category?: OrganizationCategory | string,
  ): Record<string, unknown> {
    if (category === undefined || category === '') {
      return {};
    }
    return { category: CategoryPrismaUtil.toOrganizationCategory(category) };
  }
}
