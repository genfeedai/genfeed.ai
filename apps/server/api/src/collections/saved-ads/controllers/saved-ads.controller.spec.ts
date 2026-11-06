import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { SavedAdsController } from '@api/collections/saved-ads/controllers/saved-ads.controller';
import type {
  SaveAdDto,
  UnsaveSavedAdDto,
  UpdateSavedAdNoteDto,
} from '@api/collections/saved-ads/dto/saved-ad.dto';
import type { SavedAdsService } from '@api/collections/saved-ads/services/saved-ads.service';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn(
    (_request: unknown, _serializer: unknown, data: unknown) => ({ data }),
  ),
}));

const brandId = '550e8400-e29b-41d4-a716-446655440003';
const request = { originalUrl: '/saved-ads' } as Request;
const user = {
  brandId,
  id: 'session-id',
  organizationId: 'org-1',
  userId: 'legacy-base62-user-id',
} as AuthenticatedUser;

type SavedAd = {
  adId: string;
  brandId: string;
  id: string;
  note?: string;
  organizationId: string;
  userId: string;
};

/** Saved ads stored per organization, as the service persists them. */
function createSavedAds(rows: SavedAd[]) {
  return {
    list: async (organizationId: string, brand: string) => {
      const docs = rows.filter(
        (row) => row.organizationId === organizationId && row.brandId === brand,
      );
      return { docs, totalDocs: docs.length };
    },
    saveMany: async (
      organizationId: string,
      userId: string,
      inputs: { adId: string; brandId: string }[],
    ) =>
      inputs.map((input) => {
        const row = {
          adId: input.adId,
          brandId: input.brandId,
          id: `saved-${rows.length + 1}`,
          organizationId,
          userId,
        };
        rows.push(row);
        return row;
      }),
    unsaveMany: async (organizationId: string, inputs: { id: string }[]) => {
      const ids = inputs.map((input) => input.id);
      const removed = rows.filter(
        (row) => row.organizationId === organizationId && ids.includes(row.id),
      );
      for (const row of removed) rows.splice(rows.indexOf(row), 1);
      return removed.map((row) => row.id);
    },
    updateNotes: async (
      organizationId: string,
      inputs: { id: string; note: string }[],
    ) =>
      inputs.flatMap((input) => {
        const row = rows.find(
          (item) =>
            item.id === input.id && item.organizationId === organizationId,
        );
        if (!row) return [];
        row.note = input.note;
        return [row];
      }),
  };
}

describe('SavedAdsController', () => {
  let rows: SavedAd[];
  let controller: SavedAdsController;

  beforeEach(() => {
    rows = [];
    controller = new SavedAdsController(
      createSavedAds(rows) as unknown as SavedAdsService,
    );
  });

  it('derives canonical user and tenant ownership for an array save', async () => {
    await controller.save(request, user, [
      { adId: 'ad-1', brandId, source: 'public' },
    ] as SaveAdDto[]);

    expect(rows).toEqual([
      {
        adId: 'ad-1',
        brandId,
        id: 'saved-1',
        organizationId: 'org-1',
        userId: 'legacy-base62-user-id',
      },
    ]);
  });

  it('rejects a cross-brand list', async () => {
    rows.push({
      adId: 'ad-x',
      brandId: '550e8400-e29b-41d4-a716-446655440004',
      id: 'saved-x',
      organizationId: 'org-1',
      userId: 'someone',
    });

    await expect(
      controller.list(request, user, {
        brandId: '550e8400-e29b-41d4-a716-446655440004',
        limit: 20,
        page: 1,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('bounds provider-backed save batches', async () => {
    const inputs = Array.from({ length: 6 }, (_, index) => ({
      adId: `ad-${index}`,
      brandId,
      source: 'public',
    }));

    await expect(
      controller.save(request, user, inputs as SaveAdDto[]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(rows).toEqual([]);
  });

  it('keeps note and unsave mutations array-shaped and org-scoped', async () => {
    await controller.save(request, user, [
      { adId: 'ad-1', brandId, source: 'public' },
      { adId: 'ad-2', brandId, source: 'public' },
    ] as SaveAdDto[]);

    await controller.updateNotes(request, user, [
      { brandId, id: 'saved-1', note: 'Keep this hook' },
    ] as UpdateSavedAdNoteDto[]);
    await expect(
      controller.unsave(user, [
        { brandId, id: 'saved-2' },
      ] as UnsaveSavedAdDto[]),
    ).resolves.toEqual({ data: ['saved-2'] });

    expect(rows).toEqual([
      expect.objectContaining({ id: 'saved-1', note: 'Keep this hook' }),
    ]);
  });
});
