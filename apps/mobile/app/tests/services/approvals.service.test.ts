import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.hoisted(() => vi.fn());

vi.mock('@/services/api/base-http.service', () => ({
  apiRequest,
}));

import { approvalsService } from '@/services/api/approvals.service';

describe('approvalsService', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockResolvedValue({ data: { id: 'appr-1' } });
  });

  it('lists approvals with status and content filters', async () => {
    await approvalsService.findAll('token', {
      contentType: 'post',
      page: 1,
      status: 'pending',
    });

    expect(apiRequest).toHaveBeenCalledWith('token', 'approvals', {
      params: {
        contentType: 'post',
        page: 1,
        pageSize: undefined,
        status: 'pending',
      },
    });
  });

  it('posts approve, reject, bulk, and count routes', async () => {
    await approvalsService.approve('token', 'appr-1');
    await approvalsService.reject('token', 'appr-1', { reason: 'off brand' });
    await approvalsService.bulkApprove('token', ['a', 'b']);
    await approvalsService.getCount('token', 'pending');
    await approvalsService.findOne('token', 'appr-1');

    expect(apiRequest).toHaveBeenNthCalledWith(
      1,
      'token',
      'approvals/appr-1/approve',
      { body: {}, method: 'POST' },
    );
    expect(apiRequest).toHaveBeenNthCalledWith(
      2,
      'token',
      'approvals/appr-1/reject',
      { body: { reason: 'off brand' }, method: 'POST' },
    );
    expect(apiRequest).toHaveBeenNthCalledWith(
      3,
      'token',
      'approvals/bulk/approve',
      {
        body: { ids: ['a', 'b'] },
        method: 'POST',
      },
    );
    expect(apiRequest).toHaveBeenNthCalledWith(4, 'token', 'approvals/count', {
      params: { status: 'pending' },
    });
    expect(apiRequest).toHaveBeenNthCalledWith(5, 'token', 'approvals/appr-1');
  });
});
