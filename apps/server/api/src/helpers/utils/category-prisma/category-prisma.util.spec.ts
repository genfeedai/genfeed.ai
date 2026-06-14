import { IngredientCategory, OrganizationCategory } from '@genfeedai/enums';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { CategoryPrismaUtil } from './category-prisma.util';

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
  });
});
