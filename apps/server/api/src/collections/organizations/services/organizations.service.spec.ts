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
});
