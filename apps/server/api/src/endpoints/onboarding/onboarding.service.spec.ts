/**
 * Regression tests for #564 — OrganizationCategory enum mapping (onboarding write path).
 *
 * The install-readiness failure path:
 *   GET /v1/onboarding/install-readiness
 *   → OnboardingService.ensureOnboardingWorkspace()
 *   → UserSetupService.initializeUserResources(userId, category?)
 *   → organizationsService.create({ category: 'business' })   ← app-form
 *   → OrganizationsService.create() normalises to 'BUSINESS'  ← Prisma-form
 *   → prisma.organization.create({ data: { category: 'BUSINESS' } }) ✓
 *
 * OrganizationsService is the boundary that fixes the bug.  These tests exercise
 * it directly, proving the normalization that protects the onboarding path.
 *
 * NOTE: UserSetupService cannot be imported in this worktree because it pulls
 * in CreditsUtilsService → LlmDispatcherService → @anthropic-ai/sdk which is
 * absent from the worktree's node_modules (pre-existing workspace limitation).
 * The integration-layer assertion is covered by organizations.service.spec.ts.
 */

vi.mock('@genfeedai/prisma', () => ({
  // BaseService.getPrismaEnumValues reads enum value sets off this namespace directly.
  OrganizationCategory: {
    AGENCY: 'AGENCY',
    BUSINESS: 'BUSINESS',
    CREATOR: 'CREATOR',
  },
  PrismaClient: class {},
  // Organization model has: id, slug, label, category (enum), accountType (enum), isDeleted.
  // getModelMeta is used by BaseService to look up field/enum metadata.
  getModelMeta: () => ({
    allFields: ['id', 'slug', 'label', 'category', 'accountType', 'isDeleted'],
    enumFields: {
      accountType: { enumType: 'OrganizationCategory', isRequired: false },
      category: { enumType: 'OrganizationCategory', isRequired: true },
    },
  }),
}));

import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { OrganizationCategory } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';

describe('Onboarding path — regression #564: OrganizationCategory enum mapping', () => {
  const organizationDelegate = {
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  };

  const prisma = {
    organization: organizationDelegate,
  } as unknown as PrismaService;

  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;

  let organizationsService: OrganizationsService;

  beforeEach(() => {
    vi.clearAllMocks();
    organizationsService = new OrganizationsService(prisma, logger);
    organizationDelegate.create.mockImplementation(({ data }) =>
      Promise.resolve({ ...data, id: 'org_reg564' }),
    );
    organizationDelegate.findFirst.mockResolvedValue(null);
  });

  /**
   * The onboarding path calls organizationsService.create({ category: OrganizationCategory.BUSINESS })
   * which is the app-form value 'business'.  OrganizationsService.create() must normalise it to
   * the Prisma UPPERCASE form before writing.
   */
  describe('OrganizationsService.create — app-form category → Prisma UPPERCASE (onboarding write boundary)', () => {
    it('converts OrganizationCategory.BUSINESS ("business") to Prisma "BUSINESS"', async () => {
      await organizationsService.create({
        category: OrganizationCategory.BUSINESS,
        label: 'Default Organization',
        slug: 'default-organization',
        userId: 'user_1',
      } as never);

      expect(organizationDelegate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ category: 'BUSINESS' }),
        }),
      );
    });

    it('converts OrganizationCategory.CREATOR ("creator") to Prisma "CREATOR"', async () => {
      await organizationsService.create({
        category: OrganizationCategory.CREATOR,
        label: 'Creator Org',
        slug: 'creator-org',
        userId: 'user_2',
      } as never);

      expect(organizationDelegate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ category: 'CREATOR' }),
        }),
      );
    });

    it('converts OrganizationCategory.AGENCY ("agency") to Prisma "AGENCY"', async () => {
      await organizationsService.create({
        category: OrganizationCategory.AGENCY,
        label: 'Agency Org',
        slug: 'agency-org',
        userId: 'user_3',
      } as never);

      expect(organizationDelegate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ category: 'AGENCY' }),
        }),
      );
    });

    it('passes through an already-UPPERCASE category idempotently', async () => {
      await organizationsService.create({
        category: 'BUSINESS' as OrganizationCategory,
        label: 'Idempotent Org',
        slug: 'idempotent-org',
        userId: 'user_4',
      } as never);

      expect(organizationDelegate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ category: 'BUSINESS' }),
        }),
      );
    });

    it('also normalises accountType field when present', async () => {
      await organizationsService.patch('org_1', {
        accountType: OrganizationCategory.CREATOR as never,
      });

      expect(organizationDelegate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ accountType: 'CREATOR' }),
        }),
      );
    });

    it('throws BadRequestException for an unrecognised category string', () => {
      // OrganizationsService.create() normalises the category synchronously,
      // before its first await, so the throw escapes before a promise is
      // returned — assert synchronously rather than via .rejects.
      expect(() =>
        organizationsService.create({
          category: 'personal' as OrganizationCategory,
          label: 'Bad Org',
          slug: 'bad-org',
          userId: 'user_5',
        } as never),
      ).toThrow(BadRequestException);
    });
  });
});
