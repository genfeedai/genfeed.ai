import { WatchlistsController } from '@api/collections/watchlists/controllers/watchlists.controller';
import { WatchlistsService } from '@api/collections/watchlists/services/watchlists.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('WatchlistsController', () => {
  let controller: WatchlistsController;
  let watchlistsService: Record<string, ReturnType<typeof vi.fn>>;

  const userId = '507f191e810c19729de860ee'.toString();
  const orgId = '507f191e810c19729de860ee'.toString();
  const brandId = '507f191e810c19729de860ee'.toString();
  const watchlistId = '507f191e810c19729de860ee'.toString();

  const mockUser = {
    id: 'clerk_user_123',
    publicMetadata: { brand: brandId, organization: orgId, user: userId },
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
          _id: '507f191e810c19729de860ee',
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
        id: 'clerk_user_123',
        publicMetadata: { organization: orgId, user: userId },
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
        _id: watchlistId,
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
        controller.findOne(mockRequest, '507f191e810c19729de860ee'.toString()),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create a new watchlist item', async () => {
      const dto = {
        brand: brandId,
        handle: 'newcreator',
        label: 'New Creator',
        organization: orgId,
        platform: 'tiktok',
        user: userId,
      };
      const created = { _id: '507f191e810c19729de860ee', ...dto };
      watchlistsService.create.mockResolvedValue(created);

      const result = await controller.create(
        dto as never,
        mockRequest,
        mockUser,
      );

      expect(watchlistsService.create).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw ConflictException when creator already exists', async () => {
      watchlistsService.findByHandle.mockResolvedValue({
        _id: '507f191e810c19729de860ee',
        handle: 'existing',
      });

      const dto = {
        brand: brandId,
        handle: 'existing',
        label: 'Existing',
        platform: 'tiktok',
      };

      await expect(
        controller.create(dto as never, mockRequest, mockUser),
      ).rejects.toThrow(ConflictException);
    });

    it('should set user and organization from metadata when not provided', async () => {
      const dto = {
        brand: brandId,
        handle: 'newcreator',
        label: 'New Creator',
        platform: 'tiktok',
      } as Record<string, unknown>;
      watchlistsService.create.mockResolvedValue({
        _id: '507f191e810c19729de860ee',
        ...dto,
      });

      await controller.create(dto as never, mockRequest, mockUser);

      const createArg = watchlistsService.create.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(createArg.user).toBe(userId);
      expect(createArg.organization).toBe(orgId);
    });
  });

  describe('quickAdd', () => {
    it('should create a watchlist item with minimal data', async () => {
      const dto = { handle: 'fastcreator', platform: 'instagram' };
      watchlistsService.create.mockResolvedValue({
        _id: '507f191e810c19729de860ee',
        ...dto,
        label: '@fastcreator',
      });

      const result = await controller.quickAdd(
        dto as never,
        mockRequest,
        mockUser,
      );

      expect(watchlistsService.create).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should return existing item instead of error for duplicates', async () => {
      const existing = {
        _id: '507f191e810c19729de860ee',
        handle: 'dupcreator',
        platform: 'tiktok',
      };
      watchlistsService.findByHandle.mockResolvedValue(existing);

      const dto = { handle: 'dupcreator', platform: 'tiktok' };
      const result = await controller.quickAdd(
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
        _id: watchlistId,
        brand: brandId,
        handle: 'creator1',
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
        controller.update(mockRequest, '507f191e810c19729de860ee'.toString(), {
          notes: 'X',
        } as never),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when handle update causes duplicate', async () => {
      const existing = {
        _id: watchlistId,
        brand: brandId,
        handle: 'creator1',
        platform: 'tiktok',
      };
      watchlistsService.findOne.mockResolvedValue(existing);
      watchlistsService.findByHandle.mockResolvedValue({
        _id: '607f191e810c19729de860ff', // different ID = duplicate
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
