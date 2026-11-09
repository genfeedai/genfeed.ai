import { AdminFeaturedMediaService } from '@api/endpoints/admin/featured-media/featured-media.service';
import { describe, expect, it } from 'vitest';

interface MediaRow {
  category: string;
  organizationId: string;
  id: string;
  isDeleted: boolean;
  isHighlighted: boolean;
  scope: string;
  status: string;
}

interface MediaWhere {
  category: { in: string[] };
  organizationId: string;
  id: string;
  isDeleted: boolean;
  scope: string;
  status: string;
}

function matches(row: MediaRow, where: MediaWhere): boolean {
  return (
    where.category.in.includes(row.category) &&
    row.id === where.id &&
    row.organizationId === where.organizationId &&
    row.isDeleted === where.isDeleted &&
    row.scope === where.scope &&
    row.status === where.status
  );
}

function createWorld(rows: MediaRow[]) {
  const prisma = {
    ingredient: {
      updateMany: async (args: {
        data: { isHighlighted: boolean };
        where: MediaWhere;
      }) => {
        const hits = rows.filter((row) => matches(row, args.where));
        for (const row of hits) {
          row.isHighlighted = args.data.isHighlighted;
        }
        return { count: hits.length };
      },
    },
  };
  return new AdminFeaturedMediaService(prisma as never);
}

const publicVideo: MediaRow = {
  category: 'VIDEO',
  id: 'video-1',
  isDeleted: false,
  isHighlighted: false,
  organizationId: 'org-1',
  scope: 'PUBLIC',
  status: 'GENERATED',
};

describe('AdminFeaturedMediaService', () => {
  it('features and unfeatures a public generated video', async () => {
    const row = { ...publicVideo };
    const service = createWorld([row]);

    await expect(
      service.setFeatured('org-1', 'video-1', true),
    ).resolves.toEqual({
      id: 'video-1',
      isHighlighted: true,
    });
    expect(row.isHighlighted).toBe(true);

    await service.setFeatured('org-1', 'video-1', false);
    expect(row.isHighlighted).toBe(false);
  });

  it.each([
    ['private', { scope: 'ORGANIZATION' }],
    ['deleted', { isDeleted: true }],
    ['still processing', { status: 'PROCESSING' }],
    ['not an image or video', { category: 'AUDIO' }],
    ['in another organization', { organizationId: 'org-2' }],
  ])('refuses media that is %s', async (_label, change) => {
    const row = { ...publicVideo, ...change };
    const service = createWorld([row]);

    await expect(
      service.setFeatured('org-1', 'video-1', true),
    ).rejects.toThrow();
    expect(row.isHighlighted).toBe(false);
  });
});
