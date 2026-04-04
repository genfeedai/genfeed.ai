import { LinksController } from '@api/collections/links/controllers/links.controller';
import { LinksService } from '@api/collections/links/services/links.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Types } from 'mongoose';

describe('LinksController', () => {
  let controller: LinksController;
  let linksService: Record<string, ReturnType<typeof vi.fn>>;
  let cacheService: Record<string, ReturnType<typeof vi.fn>>;

  const userId = new Types.ObjectId().toString();
  const orgId = new Types.ObjectId().toString();
  const brandId = new Types.ObjectId().toString();
  const linkId = new Types.ObjectId().toString();

  const mockUser = {
    id: 'clerk_user_123',
    publicMetadata: { brand: brandId, organization: orgId, user: userId },
  } as never;

  const mockRequest = {
    get: vi.fn().mockReturnValue('localhost'),
    headers: {},
    path: '/links',
    protocol: 'https',
  } as never;

  const mockLogger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(() => {
    linksService = {
      create: vi.fn(),
      findAll: vi.fn().mockResolvedValue({
        docs: [],
        hasNextPage: false,
        hasPrevPage: false,
        limit: 10,
        page: 1,
        totalDocs: 0,
        totalPages: 1,
      }),
      findOne: vi.fn(),
      patch: vi.fn(),
      remove: vi.fn(),
    };

    cacheService = {
      invalidateByTags: vi.fn().mockResolvedValue(undefined),
    };

    controller = new LinksController(
      linksService as unknown as LinksService,
      mockLogger as unknown as LoggerService,
      cacheService as unknown as CacheService,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('enrichCreateDto', () => {
    it('should add brand from user metadata', () => {
      const dto = {
        category: 'social',
        label: 'Twitter',
        url: 'https://x.com/test',
      };
      const result = controller.enrichCreateDto(dto as never, mockUser);

      expect(result.brand).toBeInstanceOf(Types.ObjectId);
      expect(result.brand.toString()).toBe(brandId);
    });

    it('should not add user field to the DTO', () => {
      const dto = {
        category: 'social',
        label: 'Twitter',
        url: 'https://x.com/test',
      };
      const result = controller.enrichCreateDto(dto as never, mockUser);

      expect(result).not.toHaveProperty('user');
    });
  });

  describe('enrichUpdateDto', () => {
    it('should convert brand string to ObjectId when present', async () => {
      const newBrandId = new Types.ObjectId().toString();
      const dto = { brand: newBrandId, label: 'Updated' };
      const result = await controller.enrichUpdateDto(dto as never);

      expect(result.brand).toBeInstanceOf(Types.ObjectId);
    });

    it('should not add user field', async () => {
      const dto = { label: 'Updated' };
      const result = await controller.enrichUpdateDto(dto as never);

      expect(result).not.toHaveProperty('user');
    });
  });

  describe('getPopulateForOwnershipCheck', () => {
    it('should return brand populate option', () => {
      const populate = controller.getPopulateForOwnershipCheck();

      expect(populate).toHaveLength(1);
      expect(populate[0].path).toBe('brand');
    });
  });

  describe('canUserModifyEntity', () => {
    it('should return true when entity brand matches user brand', () => {
      const entity = { brand: { _id: new Types.ObjectId(brandId) } };
      const result = controller.canUserModifyEntity(mockUser, entity);

      expect(result).toBe(true);
    });

    it('should return false when entity brand does not match user brand', () => {
      const entity = { brand: { _id: new Types.ObjectId() } };
      const result = controller.canUserModifyEntity(mockUser, entity);

      expect(result).toBe(false);
    });

    it('should handle brand as string ObjectId', () => {
      const entity = { brand: new Types.ObjectId(brandId) };
      const result = controller.canUserModifyEntity(mockUser, entity);

      expect(result).toBe(true);
    });
  });

  describe('create', () => {
    it('should create a link and invalidate cache', async () => {
      linksService.create.mockResolvedValue({
        _id: new Types.ObjectId(linkId),
        category: 'social',
        label: 'Twitter',
        url: 'https://x.com/test',
      });

      // Mock findOne for ownership check in BaseCRUDController
      const dto = {
        brand: brandId,
        category: 'social',
        label: 'Twitter',
        url: 'https://x.com/test',
      };

      await controller.create(mockRequest, mockUser, dto as never);

      expect(linksService.create).toHaveBeenCalled();
      expect(cacheService.invalidateByTags).toHaveBeenCalledWith([
        'brands',
        'links',
      ]);
    });
  });

  describe('patch', () => {
    it('should update a link and invalidate cache', async () => {
      const existingLink = {
        _id: new Types.ObjectId(linkId),
        brand: { _id: new Types.ObjectId(brandId) },
        label: 'Old',
      };
      linksService.findOne.mockResolvedValue(existingLink);
      linksService.patch.mockResolvedValue({
        ...existingLink,
        label: 'Updated',
      });

      await controller.patch(mockRequest, mockUser, linkId, {
        label: 'Updated',
      } as never);

      expect(cacheService.invalidateByTags).toHaveBeenCalledWith([
        'brands',
        'links',
      ]);
    });
  });

  describe('remove', () => {
    it('should remove a link and invalidate cache', async () => {
      const existingLink = {
        _id: new Types.ObjectId(linkId),
        brand: { _id: new Types.ObjectId(brandId) },
        isDeleted: false,
      };
      linksService.findOne.mockResolvedValue(existingLink);
      linksService.remove.mockResolvedValue({
        ...existingLink,
        isDeleted: true,
      });

      await controller.remove(mockRequest, mockUser, linkId);

      expect(linksService.remove).toHaveBeenCalled();
      expect(cacheService.invalidateByTags).toHaveBeenCalledWith([
        'brands',
        'links',
      ]);
    });
  });
});
