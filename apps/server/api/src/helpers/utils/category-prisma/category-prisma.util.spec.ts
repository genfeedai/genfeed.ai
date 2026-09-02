import {
  AssetScope,
  IngredientCategory,
  IngredientStatus,
  OrganizationCategory,
} from '@genfeedai/enums';
import { BadRequestException } from '@nestjs/common';
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
] as const;

describe('CategoryPrismaUtil', () => {
  describe('toIngredientCategory', () => {
    it('maps IngredientCategory.IMAGE (app-form) to Prisma IMAGE', () => {
      expect(
        CategoryPrismaUtil.toIngredientCategory(IngredientCategory.IMAGE),
      ).toBe('IMAGE');
    });

    it('maps IngredientCategory.VIDEO (app-form) to Prisma VIDEO', () => {
      expect(
        CategoryPrismaUtil.toIngredientCategory(IngredientCategory.VIDEO),
      ).toBe('VIDEO');
    });

    it('maps IngredientCategory.MUSIC to Prisma MUSIC', () => {
      expect(
        CategoryPrismaUtil.toIngredientCategory(IngredientCategory.MUSIC),
      ).toBe('MUSIC');
    });

    it('maps IngredientCategory.GIF to Prisma GIF', () => {
      expect(
        CategoryPrismaUtil.toIngredientCategory(IngredientCategory.GIF),
      ).toBe('GIF');
    });

    it('maps IngredientCategory.AVATAR to Prisma AVATAR', () => {
      expect(
        CategoryPrismaUtil.toIngredientCategory(IngredientCategory.AVATAR),
      ).toBe('AVATAR');
    });

    it('maps IngredientCategory.AUDIO to Prisma AUDIO', () => {
      expect(
        CategoryPrismaUtil.toIngredientCategory(IngredientCategory.AUDIO),
      ).toBe('AUDIO');
    });

    it('maps IngredientCategory.IMAGE_EDIT to Prisma IMAGE_EDIT', () => {
      expect(
        CategoryPrismaUtil.toIngredientCategory(IngredientCategory.IMAGE_EDIT),
      ).toBe('IMAGE_EDIT');
    });

    it('maps IngredientCategory.VIDEO_EDIT to Prisma VIDEO_EDIT', () => {
      expect(
        CategoryPrismaUtil.toIngredientCategory(IngredientCategory.VIDEO_EDIT),
      ).toBe('VIDEO_EDIT');
    });

    it('maps IngredientCategory.VOICE to Prisma VOICE', () => {
      expect(
        CategoryPrismaUtil.toIngredientCategory(IngredientCategory.VOICE),
      ).toBe('VOICE');
    });

    it('maps IngredientCategory.INGREDIENT to Prisma INGREDIENT', () => {
      expect(
        CategoryPrismaUtil.toIngredientCategory(IngredientCategory.INGREDIENT),
      ).toBe('INGREDIENT');
    });

    it('maps IngredientCategory.TEXT to Prisma TEXT', () => {
      expect(
        CategoryPrismaUtil.toIngredientCategory(IngredientCategory.TEXT),
      ).toBe('TEXT');
    });

    it('maps IngredientCategory.SOURCE to Prisma SOURCE', () => {
      expect(
        CategoryPrismaUtil.toIngredientCategory(IngredientCategory.SOURCE),
      ).toBe('SOURCE');
    });

    it('passes through an already-Prisma-form value idempotently', () => {
      expect(CategoryPrismaUtil.toIngredientCategory('VIDEO')).toBe('VIDEO');
      expect(CategoryPrismaUtil.toIngredientCategory('IMAGE_EDIT')).toBe(
        'IMAGE_EDIT',
      );
    });

    it('returns undefined for undefined', () => {
      expect(
        CategoryPrismaUtil.toIngredientCategory(undefined),
      ).toBeUndefined();
    });

    it('returns undefined for empty string', () => {
      expect(CategoryPrismaUtil.toIngredientCategory('')).toBeUndefined();
    });

    it('throws BadRequestException for a non-empty unmappable value', () => {
      expect(() =>
        CategoryPrismaUtil.toIngredientCategory('unknown-category'),
      ).toThrow(BadRequestException);
    });

    it('throws BadRequestException with the offending value in the message', () => {
      expect(() => CategoryPrismaUtil.toIngredientCategory('bad')).toThrow(
        'Unknown IngredientCategory: bad',
      );
    });
  });

  describe('toIngredientCategoryFilter', () => {
    it('returns { category: "VIDEO" } for IngredientCategory.VIDEO', () => {
      expect(
        CategoryPrismaUtil.toIngredientCategoryFilter(IngredientCategory.VIDEO),
      ).toEqual({ category: 'VIDEO' });
    });

    it('returns {} for undefined', () => {
      expect(CategoryPrismaUtil.toIngredientCategoryFilter(undefined)).toEqual(
        {},
      );
    });

    it('returns {} for empty string', () => {
      expect(CategoryPrismaUtil.toIngredientCategoryFilter('')).toEqual({});
    });
  });

  describe('toOrganizationCategory', () => {
    it('maps OrganizationCategory.CREATOR (app-form) to Prisma CREATOR', () => {
      expect(
        CategoryPrismaUtil.toOrganizationCategory(OrganizationCategory.CREATOR),
      ).toBe('CREATOR');
    });

    it('maps OrganizationCategory.BUSINESS (app-form) to Prisma BUSINESS', () => {
      expect(
        CategoryPrismaUtil.toOrganizationCategory(
          OrganizationCategory.BUSINESS,
        ),
      ).toBe('BUSINESS');
    });

    it('maps OrganizationCategory.AGENCY (app-form) to Prisma AGENCY', () => {
      expect(
        CategoryPrismaUtil.toOrganizationCategory(OrganizationCategory.AGENCY),
      ).toBe('AGENCY');
    });

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

    it('returns undefined for empty string', () => {
      expect(CategoryPrismaUtil.toOrganizationCategory('')).toBeUndefined();
    });

    it('throws BadRequestException for a non-empty unmappable value', () => {
      expect(() =>
        CategoryPrismaUtil.toOrganizationCategory('unknown'),
      ).toThrow(BadRequestException);
    });

    it('throws BadRequestException with the offending value in the message', () => {
      expect(() =>
        CategoryPrismaUtil.toOrganizationCategory('personal'),
      ).toThrow('Unknown OrganizationCategory: personal');
    });
  });

  describe('toAssetScope', () => {
    it('maps AssetScope.PUBLIC (app-form) to Prisma PUBLIC', () => {
      expect(CategoryPrismaUtil.toAssetScope(AssetScope.PUBLIC)).toBe('PUBLIC');
    });

    it('maps AssetScope.USER to Prisma USER', () => {
      expect(CategoryPrismaUtil.toAssetScope(AssetScope.USER)).toBe('USER');
    });

    it('maps AssetScope.BRAND to Prisma BRAND', () => {
      expect(CategoryPrismaUtil.toAssetScope(AssetScope.BRAND)).toBe('BRAND');
    });

    it('maps AssetScope.ORGANIZATION to Prisma ORGANIZATION', () => {
      expect(CategoryPrismaUtil.toAssetScope(AssetScope.ORGANIZATION)).toBe(
        'ORGANIZATION',
      );
    });

    it('passes through an already-Prisma-form value idempotently', () => {
      expect(CategoryPrismaUtil.toAssetScope('PUBLIC')).toBe('PUBLIC');
      expect(CategoryPrismaUtil.toAssetScope('USER')).toBe('USER');
    });

    it('returns undefined for undefined', () => {
      expect(CategoryPrismaUtil.toAssetScope(undefined)).toBeUndefined();
    });

    it('returns undefined for empty string', () => {
      expect(CategoryPrismaUtil.toAssetScope('')).toBeUndefined();
    });

    it('throws BadRequestException for a non-empty unmappable value', () => {
      expect(() => CategoryPrismaUtil.toAssetScope('unknown')).toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException with the offending value in the message', () => {
      expect(() => CategoryPrismaUtil.toAssetScope('private')).toThrow(
        'Unknown AssetScope: private',
      );
    });
  });

  describe('toIngredientStatus', () => {
    it('maps IngredientStatus.GENERATED (app-form) to Prisma GENERATED', () => {
      expect(
        CategoryPrismaUtil.toIngredientStatus(IngredientStatus.GENERATED),
      ).toBe('GENERATED');
    });

    it('maps IngredientStatus.DRAFT to Prisma DRAFT', () => {
      expect(
        CategoryPrismaUtil.toIngredientStatus(IngredientStatus.DRAFT),
      ).toBe('DRAFT');
    });

    it('maps IngredientStatus.FAILED to Prisma FAILED', () => {
      expect(
        CategoryPrismaUtil.toIngredientStatus(IngredientStatus.FAILED),
      ).toBe('FAILED');
    });

    it('passes through an already-Prisma-form value idempotently', () => {
      expect(CategoryPrismaUtil.toIngredientStatus('GENERATED')).toBe(
        'GENERATED',
      );
      expect(CategoryPrismaUtil.toIngredientStatus('DRAFT')).toBe('DRAFT');
    });

    it('returns undefined for undefined', () => {
      expect(CategoryPrismaUtil.toIngredientStatus(undefined)).toBeUndefined();
    });

    it('returns undefined for empty string', () => {
      expect(CategoryPrismaUtil.toIngredientStatus('')).toBeUndefined();
    });

    it('throws BadRequestException for a non-empty unmappable value', () => {
      expect(() => CategoryPrismaUtil.toIngredientStatus('unknown')).toThrow(
        BadRequestException,
      );
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

    it('returns {} for empty string', () => {
      expect(CategoryPrismaUtil.toOrganizationCategoryFilter('')).toEqual({});
    });
  });

  /**
   * Guard tests (#564 acceptance criterion):
   *
   * These tests are INTENTIONALLY exhaustive. They will FAIL if:
   *   - A new member is added to @genfeedai/enums IngredientCategory without
   *     updating APP_TO_PRISMA_INGREDIENT_CATEGORY in category-prisma.util.ts.
   *   - A new member is added to @genfeedai/enums OrganizationCategory without
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

    it('every Prisma IngredientCategory member is the output of some app-enum mapping (no stale Prisma members)', () => {
      const allMappedIngredientOutputs = Object.values(IngredientCategory).map(
        (v) => CategoryPrismaUtil.toIngredientCategory(v),
      );
      for (const prismaValue of PRISMA_INGREDIENT_CATEGORY_MEMBERS) {
        expect(
          allMappedIngredientOutputs,
          `Prisma member '${prismaValue}' is not the output of any app-enum mapping — stale Prisma member list or missing production map entry`,
        ).toContain(prismaValue);
      }
    });

    it('every Prisma OrganizationCategory member is the output of some app-enum mapping (no stale Prisma members)', () => {
      const allMappedOrgOutputs = Object.values(OrganizationCategory).map((v) =>
        CategoryPrismaUtil.toOrganizationCategory(v),
      );
      for (const prismaValue of PRISMA_ORGANIZATION_CATEGORY_MEMBERS) {
        expect(
          allMappedOrgOutputs,
          `Prisma member '${prismaValue}' is not the output of any app-enum mapping — stale Prisma member list or missing production map entry`,
        ).toContain(prismaValue);
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

    it('every Prisma AssetScope member is the output of some app-enum mapping', () => {
      const allMapped = Object.values(AssetScope).map((v) =>
        CategoryPrismaUtil.toAssetScope(v),
      );
      for (const prismaValue of PRISMA_ASSET_SCOPE_MEMBERS) {
        expect(
          allMapped,
          `Prisma AssetScope member '${prismaValue}' is not the output of any app-enum mapping`,
        ).toContain(prismaValue);
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

    it('every Prisma IngredientStatus member is the output of some app-enum mapping', () => {
      const allMapped = Object.values(IngredientStatus).map((v) =>
        CategoryPrismaUtil.toIngredientStatus(v),
      );
      for (const prismaValue of PRISMA_INGREDIENT_STATUS_MEMBERS) {
        expect(
          allMapped,
          `Prisma IngredientStatus member '${prismaValue}' is not the output of any app-enum mapping`,
        ).toContain(prismaValue);
      }
    });
  });
});
