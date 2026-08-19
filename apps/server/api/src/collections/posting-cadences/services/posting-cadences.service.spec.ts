import { PostCategory } from '@genfeedai/enums';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PostingCadencesService } from './posting-cadences.service';

describe('PostingCadencesService', () => {
  const create = vi.fn();
  const findMany = vi.fn();
  const findFirst = vi.fn();
  const postGroupsService = { create: vi.fn(), getOne: vi.fn() };

  let service: PostingCadencesService;

  beforeEach(() => {
    vi.clearAllMocks();
    const prisma = {
      credential: { findFirst: vi.fn().mockResolvedValue({ id: 'cred-1' }) },
      post: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn() },
      postingCadence: { create, findFirst, findMany },
      slotReservation: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
      },
    };
    service = new PostingCadencesService(
      prisma as never,
      { error: vi.fn() } as never,
      postGroupsService as never,
    );
  });

  it('rejects a cadence with neither end date nor max occurrences', async () => {
    await expect(
      service.create('org-1', 'user-1', {
        brandId: 'cbrand0000001',
        credentialId: 'ccredential01',
        format: PostCategory.REEL,
        intervalMinutes: 120,
        startsAt: '2026-08-20T00:00:00.000Z',
        windowEndMinute: 22 * 60,
        windowStartMinute: 8 * 60,
      }),
    ).rejects.toThrow('end date or a max occurrence count');
    expect(create).not.toHaveBeenCalled();
  });
});
