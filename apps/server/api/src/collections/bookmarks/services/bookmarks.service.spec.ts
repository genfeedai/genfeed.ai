vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { BookmarksService } from '@api/collections/bookmarks/services/bookmarks.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { expectCloudGuardPasses } from '@api/shared/testing/cloud-guard-assertions';
import type { LoggerService } from '@libs/logger/logger.service';
import { runWithTenantContext } from '@libs/prisma/tenant-context';

describe('BookmarksService.addGeneratedIngredient', () => {
  const bookmark = {
    findFirst: vi.fn(),
    update: vi.fn(),
  };
  let service: BookmarksService;

  beforeEach(() => {
    vi.clearAllMocks();
    bookmark.findFirst.mockResolvedValue({ id: 'bookmark-1' });
    bookmark.update.mockResolvedValue({ id: 'bookmark-1' });
    service = new BookmarksService(
      { bookmark } as unknown as PrismaService,
      {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService,
    );
  });

  it('links the ingredient with organization-scoped read and write', async () => {
    await runWithTenantContext({ organizationId: 'org-1' }, () =>
      service.addGeneratedIngredient('bookmark-1', 'ingredient-1', 'org-1'),
    );

    expect(bookmark.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'bookmark-1', isDeleted: false, organizationId: 'org-1' },
      }),
    );
    expectCloudGuardPasses('Bookmark', 'findFirst', bookmark.findFirst);
    expectCloudGuardPasses('Bookmark', 'update', bookmark.update);
  });

  it('does not write when the bookmark is outside the organization', async () => {
    bookmark.findFirst.mockResolvedValue(null);

    const result = await service.addGeneratedIngredient(
      'bookmark-1',
      'ingredient-1',
      'org-2',
    );

    expect(result).toBeNull();
    expect(bookmark.update).not.toHaveBeenCalled();
  });
});
