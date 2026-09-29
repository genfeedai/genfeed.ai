import {
  AssetScope,
  IngredientCategory,
  IngredientStatus,
  OrganizationCategory,
} from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import { CategoryPrismaUtil } from './category-prisma.util';

/**
 * Valid Prisma AssetScope values — must stay in sync with
 * packages/prisma/prisma/schema.prisma enum AssetScope.
 */
const PRISMA_ASSET_SCOPE_MEMBERS = [
  'USER',
  'BRAND',
  'ORGANIZATION',
  'PUBLIC',
] as const;

/**
 * Valid Prisma IngredientStatus values — must stay in sync with
 * packages/prisma/prisma/schema.prisma enum IngredientStatus.
 */
const PRISMA_INGREDIENT_STATUS_MEMBERS = [
  'DRAFT',
  'PROCESSING',
  'UPLOADED',
  'GENERATED',
  'VALIDATED',
  'FAILED',
  'ARCHIVED',
  'REJECTED',
] as const;

/**
 * Valid Prisma IngredientCategory values — must stay in sync with
 * packages/prisma/prisma/schema.prisma enum IngredientCategory.
 * This array is intentionally inlined to avoid a runtime import of
 * @genfeedai/prisma (generated files are absent in worktrees).
 */
const PRISMA_INGREDIENT_CATEGORY_MEMBERS = [
  'IMAGE',
  'VIDEO',
  'MUSIC',
  'GIF',
  'AVATAR',
  'AUDIO',
  'IMAGE_EDIT',
  'VIDEO_EDIT',
  'VOICE',
  'INGREDIENT',
  'TEXT',
  'SOURCE',
] as const;

/**
 * Valid Prisma OrganizationCategory values — must stay in sync with
 * packages/prisma/prisma/schema.prisma enum OrganizationCategory.
 */
const PRISMA_ORGANIZATION_CATEGORY_MEMBERS = [
  'CREATOR',
  'BUSINESS',
  'AGENCY',
  'EXPERT',
] as const;

describe('CategoryPrismaUtil', () => {
  describe('toIngredientCategory', () => {
    it('passes through an already-Prisma-form value idempotently', () => {
      expect(CategoryPrismaUtil.toIngredientCategory('VIDEO')).toBe('VIDEO');
      expect(CategoryPrismaUtil.toIngredientCategory('IMAGE_EDIT')).toBe(
        'IMAGE_EDIT',
      );
    });

    it('throws BadRequestException with the offending value in the message', () => {
      expect(() => CategoryPrismaUtil.toIngredientCategory('bad')).toThrow(
        'Unknown IngredientCategory: bad',
      );
    });
  });

  describe('toOrganizationCategory', () => {
    it('passes through an already-Prisma-form value idempotently', () => {
      expect(CategoryPrismaUtil.toOrganizationCategory('BUSINESS')).toBe(
        'BUSINESS',
      );
      expect(CategoryPrismaUtil.toOrganizationCategory('CREATOR')).toBe(
        'CREATOR',
      );
    });

    it('returns undefined for undefined', () => {
      expect(
        CategoryPrismaUtil.toOrganizationCategory(undefined),
      ).toBeUndefined();
    });

    it('throws BadRequestException with the offending value in the message', () => {
      expect(() =>
        CategoryPrismaUtil.toOrganizationCategory('personal'),
      ).toThrow('Unknown OrganizationCategory: personal');
    });
  });

  describe('toAssetScope', () => {
    it('passes through an already-Prisma-form value idempotently', () => {
      expect(CategoryPrismaUtil.toAssetScope('PUBLIC')).toBe('PUBLIC');
      expect(CategoryPrismaUtil.toAssetScope('USER')).toBe('USER');
    });

    it('returns undefined for undefined', () => {
      expect(CategoryPrismaUtil.toAssetScope(undefined)).toBeUndefined();
    });

    it('throws BadRequestException with the offending value in the message', () => {
      expect(() => CategoryPrismaUtil.toAssetScope('private')).toThrow(
        'Unknown AssetScope: private',
      );
    });
  });

  describe('toIngredientStatus', () => {
    it('passes through an already-Prisma-form value idempotently', () => {
      expect(CategoryPrismaUtil.toIngredientStatus('GENERATED')).toBe(
        'GENERATED',
      );
      expect(CategoryPrismaUtil.toIngredientStatus('DRAFT')).toBe('DRAFT');
    });

    it('returns undefined for undefined', () => {
      expect(CategoryPrismaUtil.toIngredientStatus(undefined)).toBeUndefined();
    });

    it('throws BadRequestException with the offending value in the message', () => {
      expect(() => CategoryPrismaUtil.toIngredientStatus('active')).toThrow(
        'Unknown IngredientStatus: active',
      );
    });
  });

  describe('toOrganizationCategoryFilter', () => {
    it('returns { category: "BUSINESS" } for OrganizationCategory.BUSINESS', () => {
      expect(
        CategoryPrismaUtil.toOrganizationCategoryFilter(
          OrganizationCategory.BUSINESS,
        ),
      ).toEqual({ category: 'BUSINESS' });
    });

    it('returns {} for undefined', () => {
      expect(
        CategoryPrismaUtil.toOrganizationCategoryFilter(undefined),
      ).toEqual({});
    });
  });

  /**
   * Guard tests (#564 acceptance criterion):
   *
   * These tests are INTENTIONALLY exhaustive. They will FAIL if:
   *   - A new member is added to @genfeedai/contracts IngredientCategory without
   *     updating APP_TO_PRISMA_INGREDIENT_CATEGORY in category-prisma.util.ts.
   *   - A new member is added to @genfeedai/contracts OrganizationCategory without
   *     updating APP_TO_PRISMA_ORGANIZATION_CATEGORY in category-prisma.util.ts.
   *   - A Prisma enum member is removed that the mapping still references.
   */
  describe('guard — exhaustiveness', () => {
    const prismaIngredientSet = new Set<string>(
      PRISMA_INGREDIENT_CATEGORY_MEMBERS,
    );
    const prismaOrganizationSet = new Set<string>(
      PRISMA_ORGANIZATION_CATEGORY_MEMBERS,
    );

    it('every IngredientCategory app-enum member maps to a valid Prisma IngredientCategory member', () => {
      for (const appValue of Object.values(IngredientCategory)) {
        const prismaValue = CategoryPrismaUtil.toIngredientCategory(appValue);
        expect(
          prismaValue,
          `IngredientCategory.${appValue} produced undefined — add it to APP_TO_PRISMA_INGREDIENT_CATEGORY`,
        ).toBeDefined();
        expect(
          prismaIngredientSet.has(prismaValue as string),
          `IngredientCategory.${appValue} mapped to "${prismaValue}" which is not a valid Prisma IngredientCategory member`,
        ).toBe(true);
      }
    });

    it('every OrganizationCategory app-enum member maps to a valid Prisma OrganizationCategory member', () => {
      for (const appValue of Object.values(OrganizationCategory)) {
        const prismaValue = CategoryPrismaUtil.toOrganizationCategory(appValue);
        expect(
          prismaValue,
          `OrganizationCategory.${appValue} produced undefined — add it to APP_TO_PRISMA_ORGANIZATION_CATEGORY`,
        ).toBeDefined();
        expect(
          prismaOrganizationSet.has(prismaValue as string),
          `OrganizationCategory.${appValue} mapped to "${prismaValue}" which is not a valid Prisma OrganizationCategory member`,
        ).toBe(true);
      }
    });

    it('every AssetScope app-enum member maps to a valid Prisma AssetScope member', () => {
      const prismaSet = new Set<string>(PRISMA_ASSET_SCOPE_MEMBERS);
      for (const appValue of Object.values(AssetScope)) {
        const prismaValue = CategoryPrismaUtil.toAssetScope(appValue);
        expect(
          prismaValue,
          `AssetScope.${appValue} produced undefined — add it to APP_TO_PRISMA_ASSET_SCOPE`,
        ).toBeDefined();
        expect(
          prismaSet.has(prismaValue as string),
          `AssetScope.${appValue} mapped to "${prismaValue}" which is not a valid Prisma AssetScope member`,
        ).toBe(true);
      }
    });

    it('every IngredientStatus app-enum member maps to a valid Prisma IngredientStatus member', () => {
      const prismaSet = new Set<string>(PRISMA_INGREDIENT_STATUS_MEMBERS);
      for (const appValue of Object.values(IngredientStatus)) {
        const prismaValue = CategoryPrismaUtil.toIngredientStatus(appValue);
        expect(
          prismaValue,
          `IngredientStatus.${appValue} produced undefined — add it to APP_TO_PRISMA_INGREDIENT_STATUS`,
        ).toBeDefined();
        expect(
          prismaSet.has(prismaValue as string),
          `IngredientStatus.${appValue} mapped to "${prismaValue}" which is not a valid Prisma IngredientStatus member`,
        ).toBe(true);
      }
    });
  });
});
