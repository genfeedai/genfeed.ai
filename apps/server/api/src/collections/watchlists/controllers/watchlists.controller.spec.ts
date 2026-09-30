import { WatchlistsController } from '@api/collections/watchlists/controllers/watchlists.controller';
import { WatchlistsService } from '@api/collections/watchlists/services/watchlists.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { testId } from '@helpers/testing/test-id.helper';
import { ConflictException } from '@nestjs/common';

describe('WatchlistsController', () => {
  let controller: WatchlistsController;
  let watchlistsService: Record<string, ReturnType<typeof vi.fn>>;

  const userId = testId('user');
  const orgId = testId('org');
  const brandId = testId('brand');
  const watchlistId = testId('watchlist');

  const mockUser = {
    id: 'authProvider_user_123',
    brandId: brandId,
    organizationId: orgId,
    userId: userId,
  } as never;

  const mockRequest = {
    get: vi.fn().mockReturnValue('localhost'),
    headers: {},
    path: '/watchlists',
    protocol: 'https',
    query: {},
  } as never;

  beforeEach(() => {
    watchlistsService = {
      create: vi.fn(),
      findAllByAccount: vi.fn().mockResolvedValue([]),
      findByHandle: vi.fn().mockResolvedValue(null),
      findOne: vi.fn(),
      patch: vi.fn(),
      remove: vi.fn(),
    };

    controller = new WatchlistsController(
      watchlistsService as unknown as WatchlistsService,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return watchlist items for the current brand', async () => {
      const items = [
        {
          id: watchlistId,
          handle: 'creator1',
          platform: 'tiktok',
        },
      ];
      watchlistsService.findAllByAccount.mockResolvedValue(items);

      const result = await controller.findAll(mockRequest, mockUser);

      expect(watchlistsService.findAllByAccount).toHaveBeenCalledWith(brandId);
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException when no brand ID available', async () => {
      const noBrandUser = {
        id: 'authProvider_user_123',
        organizationId: orgId,
        userId: userId,
      } as never;
      const reqNoBrand = {
        ...mockRequest,
        query: {},
      } as never;

      await expect(controller.findAll(reqNoBrand, noBrandUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findOne', () => {
    it('should return a single watchlist item when found', async () => {
      const item = {
        id: watchlistId,
        handle: 'creator1',
        platform: 'tiktok',
      };
      watchlistsService.findOne.mockResolvedValue(item);

      const result = await controller.findOne(mockRequest, watchlistId);

      expect(result).toBeDefined();
    });

    it('should throw NotFoundException when item not found', async () => {
      watchlistsService.findOne.mockResolvedValue(null);

      await expect(
        controller.findOne(mockRequest, watchlistId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create a new watchlist item', async () => {
      const dto = {
        handle: 'newcreator',
        label: 'New Creator',
        platform: 'tiktok',
      };
      const created = { id: watchlistId, ...dto };
      watchlistsService.create.mockResolvedValue(created);

      const result = await controller.create(
        dto as never,
        mockRequest,
        mockUser,
      );

      expect(watchlistsService.create).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should return the existing item instead of erroring (upsert)', async () => {
      const existing = {
        id: watchlistId,
        handle: 'existing',
        platform: 'tiktok',
      };
      watchlistsService.findByHandle.mockResolvedValue(existing);

      const dto = {
        handle: 'existing',
        label: 'Existing',
        platform: 'tiktok',
      };

      const result = await controller.create(
        dto as never,
        mockRequest,
        mockUser,
      );

      expect(watchlistsService.create).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should set user and organization from metadata when not provided', async () => {
      const dto = {
        handle: 'newcreator',
        label: 'New Creator',
        platform: 'tiktok',
      } as Record<string, unknown>;
      watchlistsService.create.mockResolvedValue({
        id: watchlistId,
        ...dto,
      });

      await controller.create(dto as never, mockRequest, mockUser);

      const createArg = watchlistsService.create.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(createArg.userId).toBe(userId);
      expect(createArg.organizationId).toBe(orgId);
    });

    it('should create a watchlist item with minimal data (quick-add semantics)', async () => {
      const dto = { handle: 'fastcreator', platform: 'instagram' };
      watchlistsService.create.mockResolvedValue({
        id: watchlistId,
        ...dto,
        label: '@fastcreator',
      });

      const result = await controller.create(
        dto as never,
        mockRequest,
        mockUser,
      );

      expect(watchlistsService.create).toHaveBeenCalled();
      const createArg = watchlistsService.create.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(createArg.label).toBe('@fastcreator');
      expect(createArg.brandId).toBe(brandId);
      expect(result).toBeDefined();
    });

    it('should return existing item instead of error for duplicates (minimal payload)', async () => {
      const existing = {
        id: watchlistId,
        handle: 'dupcreator',
        platform: 'tiktok',
      };
      watchlistsService.findByHandle.mockResolvedValue(existing);

      const dto = { handle: 'dupcreator', platform: 'tiktok' };
      const result = await controller.create(
        dto as never,
        mockRequest,
        mockUser,
      );

      expect(watchlistsService.create).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('update', () => {
    it('should update a watchlist item', async () => {
      const existing = {
        brandId,
        handle: 'creator1',
        id: watchlistId,
        platform: 'tiktok',
      };
      watchlistsService.findOne.mockResolvedValue(existing);
      watchlistsService.patch.mockResolvedValue({
        ...existing,
        notes: 'Updated notes',
      });

      const result = await controller.update(mockRequest, watchlistId, {
        notes: 'Updated notes',
      } as never);

      expect(watchlistsService.patch).toHaveBeenCalledWith(watchlistId, {
        notes: 'Updated notes',
      });
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException when updating non-existent item', async () => {
      watchlistsService.findOne.mockResolvedValue(null);

      await expect(
        controller.update(mockRequest, watchlistId, {
          notes: 'X',
        } as never),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when handle update causes duplicate', async () => {
      const existing = {
        brandId,
        handle: 'creator1',
        id: watchlistId,
        platform: 'tiktok',
      };
      watchlistsService.findOne.mockResolvedValue(existing);
      watchlistsService.findByHandle.mockResolvedValue({
        id: testId('watchlist', 2), // different ID = duplicate
        handle: 'creator2',
      });

      await expect(
        controller.update(mockRequest, watchlistId, {
          handle: 'creator2',
        } as never),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('delete', () => {
    it('should soft-delete a watchlist item', async () => {
      watchlistsService.remove.mockResolvedValue(undefined);

      const result = await controller.delete(watchlistId);

      expect(watchlistsService.remove).toHaveBeenCalledWith(watchlistId);
      expect(result).toEqual({ success: true });
    });
  });
});
