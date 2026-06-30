vi.mock('@genfeedai/prisma', () => ({
  // BaseService.getPrismaEnumValues reads enum value sets off this namespace directly.
  OrganizationCategory: { BUSINESS: 'BUSINESS', CREATOR: 'CREATOR' },
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

describe('OrganizationsService', () => {
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
  } as unknown as LoggerService;

  let service: OrganizationsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new OrganizationsService(prisma, logger);
  });

  it('normalizes app organization category values before create', async () => {
    organizationDelegate.create.mockResolvedValue({
      category: 'BUSINESS',
      id: 'org_1',
    });

    await service.create({
      category: OrganizationCategory.BUSINESS,
      label: 'Default Organization',
      slug: 'default-organization',
      userId: 'user_1',
    } as never);

    expect(organizationDelegate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          category: 'BUSINESS',
        }),
      }),
    );
  });

  it('normalizes app organization category values before patch', async () => {
    organizationDelegate.update.mockResolvedValue({
      accountType: 'CREATOR',
      category: 'CREATOR',
      id: 'org_1',
    });

    await service.patch('org_1', {
      accountType: OrganizationCategory.CREATOR,
      category: OrganizationCategory.CREATOR,
    });

    expect(organizationDelegate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountType: 'CREATOR',
          category: 'CREATOR',
        }),
      }),
    );
  });

  /**
   * Regression tests for the onboarding /brand-setup 500: generateUniqueSlug()
   * was called without excludeOrgId, so an org's own current slug looked taken
   * by its own findFirst check (TOCTOU self-collision).
   */
  describe('generateUniqueSlug', () => {
    it('returns the base slug when unused', async () => {
      organizationDelegate.findFirst.mockResolvedValue(null);

      const slug = await service.generateUniqueSlug('Genfeed.ai');

      expect(slug).toBe('genfeed-ai');
      expect(organizationDelegate.findFirst).toHaveBeenCalledTimes(1);
    });

    it('appends an incrementing counter on collision', async () => {
      organizationDelegate.findFirst
        .mockResolvedValueOnce({ id: 'org_other' })
        .mockResolvedValueOnce({ id: 'org_other' })
        .mockResolvedValueOnce(null);

      const slug = await service.generateUniqueSlug('Genfeed.ai');

      expect(slug).toBe('genfeed-ai-3');
      expect(organizationDelegate.findFirst).toHaveBeenCalledTimes(3);
    });

    it('does not self-collide when excludeOrgId matches the org holding the slug', async () => {
      organizationDelegate.findFirst.mockImplementation(({ where }) => {
        // Simulate the org's own current slug excluded via `id: { not: excludeOrgId }`.
        if (where.id?.not === 'org_1') {
          return Promise.resolve(null);
        }
        return Promise.resolve({ id: 'org_1' });
      });

      const slug = await service.generateUniqueSlug('Genfeed.ai', 'org_1');

      expect(slug).toBe('genfeed-ai');
      expect(organizationDelegate.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { not: 'org_1' },
          }),
        }),
      );
    });

    it('still detects a real collision with a different org when excludeOrgId is set', async () => {
      organizationDelegate.findFirst
        .mockResolvedValueOnce({ id: 'org_other' })
        .mockResolvedValueOnce(null);

      const slug = await service.generateUniqueSlug('Genfeed.ai', 'org_1');

      expect(slug).toBe('genfeed-ai-2');
    });

    it('throws BadRequestException when the generated slug is too short', async () => {
      await expect(service.generateUniqueSlug('!!')).rejects.toThrow(
        'Label too short to generate a valid slug',
      );
    });
  });
});
