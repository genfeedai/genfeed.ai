import type { ServerPrisma } from '@server/server.dependencies';
import { CustomerInstanceResolverService } from './customer-instance-resolver.service';

describe('CustomerInstanceResolverService', () => {
  const findMany = vi.fn();
  const prisma = {
    customerInstance: { findMany },
  } as unknown as Pick<ServerPrisma, 'customerInstance'>;

  let service: CustomerInstanceResolverService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CustomerInstanceResolverService(prisma);
  });

  it('returns the newest dedicated instance matching the fleet role', async () => {
    findMany.mockResolvedValue([
      {
        config: {
          apiUrl: 'https://images.example',
          role: 'images',
          tier: 'dedicated',
        },
      },
      {
        config: {
          apiUrl: 'https://old.example',
          role: 'images',
          tier: 'dedicated',
        },
      },
    ]);

    await expect(service.findRunningForOrg('org-1', 'images')).resolves.toEqual(
      { apiUrl: 'https://images.example' },
    );

    expect(findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      where: { isDeleted: false, organizationId: 'org-1', status: 'running' },
    });
  });

  it('accepts a dedicated full-role instance for any fleet role', async () => {
    findMany.mockResolvedValue([
      {
        config: {
          apiUrl: 'https://full.example',
          role: 'full',
          tier: 'dedicated',
        },
      },
    ]);

    await expect(service.findRunningForOrg('org-1', 'videos')).resolves.toEqual(
      { apiUrl: 'https://full.example' },
    );
  });

  it('returns null when no dedicated instance matches', async () => {
    findMany.mockResolvedValue([
      {
        config: {
          apiUrl: 'https://shared.example',
          role: 'images',
          tier: 'shared',
        },
      },
    ]);

    await expect(
      service.findRunningForOrg('org-1', 'images'),
    ).resolves.toBeNull();
  });
});
