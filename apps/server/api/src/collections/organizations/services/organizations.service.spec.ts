// Real, complete OrganizationCategory (BaseService.getPrismaEnumValues reads
// enum value sets off this namespace directly — the hand-rolled version here
// was missing AGENCY) plus real getModelMeta/PRISMA_MODEL_METADATA.Organization
// via the light @genfeedai/prisma/testing subpath.
vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { OrganizationCategory } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';

describe('OrganizationsService', () => {
  const organizationDelegate = {
    count: vi.fn(),
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
   * REST audit #1354 — route collapse: PATCH /organizations/:id/slug was
   * removed in favor of the generic PATCH /organizations/:id. The slug
   * uniqueness guard formerly in the controller now lives in patch().
   */
  describe('patch() slug uniqueness guard', () => {
    it('throws BadRequestException when the slug is taken by a different org', async () => {
      organizationDelegate.findFirst.mockResolvedValue({
        id: 'org_other',
        slug: 'taken-slug',
      });

      await expect(
        service.patch('org_1', { slug: 'taken-slug' }),
      ).rejects.toThrow('Slug "taken-slug" is already taken');

      expect(organizationDelegate.update).not.toHaveBeenCalled();
    });

    it('allows patching when the slug belongs to the same org', async () => {
      organizationDelegate.findFirst.mockResolvedValue({
        id: 'org_1',
        slug: 'my-slug',
      });
      organizationDelegate.update.mockResolvedValue({
        id: 'org_1',
        slug: 'my-slug',
      });

      await service.patch('org_1', { slug: 'my-slug' });

      expect(organizationDelegate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ slug: 'my-slug' }),
        }),
      );
    });

    it('allows patching when the slug is unused', async () => {
      organizationDelegate.findFirst.mockResolvedValue(null);
      organizationDelegate.update.mockResolvedValue({
        id: 'org_1',
        slug: 'new-slug',
      });

      await service.patch('org_1', { slug: 'new-slug' });

      expect(organizationDelegate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ slug: 'new-slug' }),
        }),
      );
    });

    it('skips the uniqueness check when slug is not part of the patch', async () => {
      organizationDelegate.update.mockResolvedValue({
        id: 'org_1',
        label: 'Renamed',
      });

      await service.patch('org_1', { label: 'Renamed' });

      expect(organizationDelegate.findFirst).not.toHaveBeenCalled();
      expect(organizationDelegate.update).toHaveBeenCalled();
    });
  });

  /**
   * REST audit #1354 — route collapse: POST /onboarding/prefix was removed
   * in favor of the generic PATCH /organizations/:id. The prefix
   * immutability + uniqueness guards formerly in OnboardingService.setPrefix()
   * now live in OrganizationsService.patch().
   */
  describe('patch() prefix immutability + uniqueness guard', () => {
    it('throws 404 when the organization does not exist', async () => {
      organizationDelegate.findFirst.mockResolvedValue(null);

      await expect(
        service.patch('org_missing', { prefix: 'GEN' }),
      ).rejects.toThrow('Organization not found');

      expect(organizationDelegate.update).not.toHaveBeenCalled();
    });

    it('throws 409 Conflict when the org already has a prefix', async () => {
      organizationDelegate.findFirst.mockResolvedValue({
        id: 'org_1',
        prefix: 'OLD',
      });

      await expect(service.patch('org_1', { prefix: 'NEW' })).rejects.toThrow(
        'Organization already has prefix "OLD". Prefix is immutable once set.',
      );

      expect(organizationDelegate.update).not.toHaveBeenCalled();
    });

    it('throws 409 Conflict when the prefix is already taken by another org', async () => {
      organizationDelegate.findFirst.mockResolvedValue({
        id: 'org_1',
        prefix: null,
      });
      organizationDelegate.count.mockResolvedValue(1);

      await expect(service.patch('org_1', { prefix: 'GEN' })).rejects.toThrow(
        'Prefix "GEN" is already taken',
      );

      expect(organizationDelegate.update).not.toHaveBeenCalled();
    });

    it('sets an uppercased prefix when the org has none and the prefix is unique', async () => {
      organizationDelegate.findFirst.mockResolvedValue({
        id: 'org_1',
        prefix: null,
      });
      organizationDelegate.count.mockResolvedValue(0);
      organizationDelegate.update.mockResolvedValue({
        id: 'org_1',
        prefix: 'GEN',
      });

      await service.patch('org_1', { prefix: 'gen' });

      expect(organizationDelegate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ prefix: 'GEN' }),
        }),
      );
    });

    it('skips the prefix guard when prefix is not part of the patch', async () => {
      organizationDelegate.update.mockResolvedValue({
        id: 'org_1',
        label: 'Renamed',
      });

      await service.patch('org_1', { label: 'Renamed' });

      expect(organizationDelegate.findFirst).not.toHaveBeenCalled();
      expect(organizationDelegate.count).not.toHaveBeenCalled();
      expect(organizationDelegate.update).toHaveBeenCalled();
    });
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
