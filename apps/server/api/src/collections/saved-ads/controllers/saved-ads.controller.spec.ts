import { SavedAdsController } from '@api/collections/saved-ads/controllers/saved-ads.controller';
import type { SavedAdsService } from '@api/collections/saved-ads/services/saved-ads.service';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '@server/auth/interfaces/authenticated-user.interface';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn(
    (_request: unknown, _serializer: unknown, data: unknown) => ({ data }),
  ),
}));

const brandId = '550e8400-e29b-41d4-a716-446655440003';
const request = { originalUrl: '/saved-ads' } as never;
const user = {
  brandId,
  id: 'session-id',
  organizationId: 'org-1',
  userId: 'legacy-base62-user-id',
} as AuthenticatedUser;

describe('SavedAdsController', () => {
  const service = {
    list: vi.fn(),
    saveMany: vi.fn(),
    unsaveMany: vi.fn(),
    updateNotes: vi.fn(),
  };
  let controller: SavedAdsController;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new SavedAdsController(service as unknown as SavedAdsService);
  });

  it('derives canonical user and tenant ownership for an array save', async () => {
    service.saveMany.mockResolvedValue([{ id: 'saved-1' }]);

    await controller.save(request, user, [
      { adId: 'ad-1', brandId, source: 'public' },
    ] as never);

    expect(service.saveMany).toHaveBeenCalledWith(
      'org-1',
      'legacy-base62-user-id',
      [{ adId: 'ad-1', brandId, source: 'public' }],
    );
  });

  it('rejects a cross-brand list before querying storage', async () => {
    await expect(
      controller.list(request, user, '550e8400-e29b-41d4-a716-446655440004'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.list).not.toHaveBeenCalled();
  });

  it('bounds provider-backed save batches', async () => {
    const inputs = Array.from({ length: 6 }, (_, index) => ({
      adId: `ad-${index}`,
      brandId,
      source: 'public',
    }));

    await expect(
      controller.save(request, user, inputs as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.saveMany).not.toHaveBeenCalled();
  });

  it('keeps note and unsave mutations array-shaped', async () => {
    service.updateNotes.mockResolvedValue([{ id: 'saved-1' }]);
    service.unsaveMany.mockResolvedValue(['saved-1']);

    await controller.updateNotes(request, user, [
      { brandId, id: 'saved-1', note: 'Keep this hook' },
    ] as never);
    await controller.unsave(user, [{ brandId, id: 'saved-1' }] as never);

    expect(service.updateNotes).toHaveBeenCalledWith('org-1', [
      { brandId, id: 'saved-1', note: 'Keep this hook' },
    ]);
    expect(service.unsaveMany).toHaveBeenCalledWith('org-1', [
      { brandId, id: 'saved-1' },
    ]);
  });
});
