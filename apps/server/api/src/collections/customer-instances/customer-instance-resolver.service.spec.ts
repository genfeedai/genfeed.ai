import type { ServerPrisma } from '@api/server.dependencies';
import { CustomerInstanceResolverService } from './customer-instance-resolver.service';

describe('CustomerInstanceResolverService', () => {
  const findFirst = vi.fn();
  const prisma = {
    customerInstance: { findFirst },
  } as unknown as Pick<ServerPrisma, 'customerInstance'>;

  let service: CustomerInstanceResolverService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CustomerInstanceResolverService(prisma);
  });

  it('returns the newest dedicated instance matching the fleet role', async () => {
    findFirst.mockResolvedValue({
      config: {
        apiUrl: 'https://images.example',
        role: 'images',
        tier: 'dedicated',
      },
    });

    await expect(service.findRunningForOrg('org-1', 'images')).resolves.toEqual(
      { apiUrl: 'https://images.example' },
    );

    expect(findFirst).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      where: {
        AND: [
          { config: { equals: 'dedicated', path: ['tier'] } },
          {
            OR: [
              { config: { equals: 'images', path: ['role'] } },
              { config: { equals: 'full', path: ['role'] } },
            ],
          },
        ],
        isDeleted: false,
        organizationId: 'org-1',
        status: 'running',
      },
    });
  });

  it('accepts a dedicated full-role instance for any fleet role', async () => {
    findFirst.mockResolvedValue({
      config: {
        apiUrl: 'https://full.example',
        role: 'full',
        tier: 'dedicated',
      },
    });

    await expect(service.findRunningForOrg('org-1', 'videos')).resolves.toEqual(
      { apiUrl: 'https://full.example' },
    );
  });

  it('returns null when no dedicated instance matches', async () => {
    findFirst.mockResolvedValue(null);

    await expect(
      service.findRunningForOrg('org-1', 'images'),
    ).resolves.toBeNull();
  });
});
