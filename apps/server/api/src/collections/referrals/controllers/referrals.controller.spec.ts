import { ReferralsController } from '@api/collections/referrals/controllers/referrals.controller';
import { ReferralsService } from '@api/collections/referrals/services/referrals.service';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';

describe('ReferralsController', () => {
  const listAdmin = vi.fn().mockResolvedValue({ docs: [], total: 0 });
  const controller = new ReferralsController({
    listAdmin,
  } as unknown as ReferralsService);
  const request = {
    originalUrl: '/referrals/admin/rewards',
  } as RequestWithContext;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults malformed admin pagination instead of passing NaN to Prisma', async () => {
    await controller.listAdmin(request, 'abc', 'not-a-page');

    expect(listAdmin).toHaveBeenCalledWith({ limit: 50, page: 1 });
  });

  it('clamps admin pagination to service-supported bounds', async () => {
    await controller.listAdmin(request, '999', '-4');

    expect(listAdmin).toHaveBeenCalledWith({ limit: 100, page: 1 });
  });
});
