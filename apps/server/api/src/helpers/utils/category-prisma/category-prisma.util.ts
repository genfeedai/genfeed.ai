import {
  AssetScope,
  IngredientCategory,
  IngredientStatus,
  OrganizationCategory,
} from '@genfeedai/contracts';
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
 * Prisma UPPERCASE enum values for AssetScope.
 * These string literals must match the Prisma schema exactly.
 */
export type PrismaAssetScopeValue =
  | 'USER'
  | 'BRAND'
  | 'ORGANIZATION'
  | 'PUBLIC';

/**
 * Prisma UPPERCASE enum values for IngredientStatus.
 * These string literals must match the Prisma schema exactly.
 */
export type PrismaIngredientStatusValue =
  | 'DRAFT'
  | 'PROCESSING'
  | 'UPLOADED'
  | 'GENERATED'
  | 'VALIDATED'
  | 'FAILED'
  | 'ARCHIVED'
  | 'REJECTED';

/**
 * Explicit app→Prisma mapping for IngredientCategory.
 *
 * Domain values already match Prisma SCREAMING_SNAKE (identity map). Kept as an
 * exhaustive boundary so a reintroduced lowercase spelling fails the guard test
 * in category-prisma.util.spec.ts. Also accepts legacy lowercase input via
 * PRISMA_INGREDIENT_CATEGORY_VALUES passthrough below after uppercasing paths.
 *
 * If you add a member to @genfeedai/contracts IngredientCategory you MUST add it
 * here too.
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
 * If you add a member to @genfeedai/contracts OrganizationCategory you MUST add it
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

/**
 * Explicit app→Prisma mapping for AssetScope.
 *
 * Domain values already match Prisma SCREAMING_SNAKE (identity map). Kept as an
 * exhaustive boundary against dual-spelling regressions.
 *
 * If you add a member to @genfeedai/contracts AssetScope you MUST add it here too —
 * the guard test in category-prisma.util.spec.ts will fail otherwise.
 */
const APP_TO_PRISMA_ASSET_SCOPE: Record<AssetScope, PrismaAssetScopeValue> = {
  [AssetScope.USER]: 'USER',
  [AssetScope.BRAND]: 'BRAND',
  [AssetScope.ORGANIZATION]: 'ORGANIZATION',
  [AssetScope.PUBLIC]: 'PUBLIC',
};

/**
 * Explicit app→Prisma mapping for IngredientStatus.
 *
 * Domain values already match Prisma SCREAMING_SNAKE (identity map). Kept as an
 * exhaustive boundary against dual-spelling regressions.
 *
 * If you add a member to @genfeedai/contracts IngredientStatus you MUST add it here
 * too — the guard test in category-prisma.util.spec.ts will fail otherwise.
 */
const APP_TO_PRISMA_INGREDIENT_STATUS: Record<
  IngredientStatus,
  PrismaIngredientStatusValue
> = {
  [IngredientStatus.DRAFT]: 'DRAFT',
  [IngredientStatus.PROCESSING]: 'PROCESSING',
  [IngredientStatus.UPLOADED]: 'UPLOADED',
  [IngredientStatus.GENERATED]: 'GENERATED',
  [IngredientStatus.VALIDATED]: 'VALIDATED',
  [IngredientStatus.FAILED]: 'FAILED',
  [IngredientStatus.ARCHIVED]: 'ARCHIVED',
  [IngredientStatus.REJECTED]: 'REJECTED',
};

/** The set of valid Prisma AssetScope UPPERCASE strings. */
const PRISMA_ASSET_SCOPE_VALUES = new Set<string>(
  Object.values(APP_TO_PRISMA_ASSET_SCOPE),
);

/** The set of valid Prisma IngredientStatus UPPERCASE strings. */
const PRISMA_INGREDIENT_STATUS_VALUES = new Set<string>(
  Object.values(APP_TO_PRISMA_INGREDIENT_STATUS),
);

/** Normalize legacy lowercase/hyphen domain spellings to Prisma labels. */
function toPrismaLabel(value: string): string {
  return value.replace(/-/g, '_').toUpperCase();
}

export class CategoryPrismaUtil {
  /**
   * Map a single IngredientCategory value to its Prisma SCREAMING_SNAKE form.
   *
   * - Domain enum values (already SCREAMING) → identity.
   * - Legacy lowercase / hyphen form (e.g. 'video', 'image-edit') → uppercased.
   * - `undefined` / empty string → returns `undefined` (caller omits the filter).
   * - Non-empty unmappable value → throws BadRequestException.
   */
  static toIngredientCategory(
    value: IngredientCategory | string,
  ): PrismaIngredientCategoryValue;
  static toIngredientCategory(value: undefined): undefined;
  static toIngredientCategory(
    value?: IngredientCategory | string,
  ): PrismaIngredientCategoryValue | undefined;
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

    // Accept already-Prisma-form values and legacy lowercase/hyphen spellings.
    const normalized = toPrismaLabel(String(value));
    if (PRISMA_INGREDIENT_CATEGORY_VALUES.has(normalized)) {
      return normalized as PrismaIngredientCategoryValue;
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

    const normalized = toPrismaLabel(String(value));
    if (PRISMA_ORGANIZATION_CATEGORY_VALUES.has(normalized)) {
      return normalized as PrismaOrganizationCategoryValue;
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

  /**
   * Map a single AssetScope app-enum value to its Prisma UPPERCASE form.
   *
   * - App-form values (lowercase, e.g. 'public') → mapped to 'PUBLIC'.
   * - Already-Prisma-form values (UPPERCASE, e.g. 'PUBLIC') → passed through
   *   idempotently.
   * - `undefined` / empty string → returns `undefined`.
   * - Non-empty unmappable value → throws BadRequestException.
   */
  static toAssetScope(
    value?: AssetScope | string,
  ): PrismaAssetScopeValue | undefined {
    if (value === undefined || value === '') {
      return undefined;
    }

    const mapped = APP_TO_PRISMA_ASSET_SCOPE[value as AssetScope];
    if (mapped !== undefined) {
      return mapped;
    }

    const normalized = toPrismaLabel(String(value));
    if (PRISMA_ASSET_SCOPE_VALUES.has(normalized)) {
      return normalized as PrismaAssetScopeValue;
    }

    throw new BadRequestException(`Unknown AssetScope: ${value}`);
  }

  /**
   * Map a single IngredientStatus app-enum value to its Prisma UPPERCASE form.
   *
   * - App-form values (lowercase, e.g. 'generated') → mapped to 'GENERATED'.
   * - Already-Prisma-form values (UPPERCASE, e.g. 'GENERATED') → passed through
   *   idempotently.
   * - `undefined` / empty string → returns `undefined`.
   * - Non-empty unmappable value → throws BadRequestException.
   */
  static toIngredientStatus(
    value?: IngredientStatus | string,
  ): PrismaIngredientStatusValue | undefined {
    if (value === undefined || value === '') {
      return undefined;
    }

    const mapped = APP_TO_PRISMA_INGREDIENT_STATUS[value as IngredientStatus];
    if (mapped !== undefined) {
      return mapped;
    }

    const normalized = toPrismaLabel(String(value));
    // Legacy alias: completed → GENERATED
    if (normalized === 'COMPLETED') {
      return 'GENERATED';
    }
    if (PRISMA_INGREDIENT_STATUS_VALUES.has(normalized)) {
      return normalized as PrismaIngredientStatusValue;
    }

    throw new BadRequestException(`Unknown IngredientStatus: ${value}`);
  }
}
