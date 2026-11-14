import { beforeEach, describe, expect, it, vi } from 'vitest';
import { approveOrganizationBrandOs } from '../../src/operations/admin-brand-os';

const { adminPost } = vi.hoisted(() => ({ adminPost: vi.fn() }));

vi.mock('../../src/api/admin-client', () => ({ adminPost }));

describe('approveOrganizationBrandOs', () => {
  beforeEach(() => {
    adminPost.mockReset();
  });

  it('posts the kit fields to the brand in the given organization and returns the approval', async () => {
    adminPost.mockResolvedValue({
      data: { revisionId: 'rev-1', status: 'APPROVED', version: 1 },
    });

    const approval = await approveOrganizationBrandOs('org 1', 'brand-1', {
      voiceTone: 'Bold and punchy',
    });

    expect(adminPost).toHaveBeenCalledWith(
      '/admin/organizations/org%201/brands/brand-1/brand-os/approve',
      { voiceTone: 'Bold and punchy' }
    );
    expect(approval.revisionId).toBe('rev-1');
  });
});
