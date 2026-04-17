import { BookmarksController } from '@api/collections/bookmarks/controllers/bookmarks.controller';
import { BookmarksQueryDto } from '@api/collections/bookmarks/dto/bookmarks-query.dto';
import { CreateBookmarkDto } from '@api/collections/bookmarks/dto/create-bookmark.dto';
import { UpdateBookmarkDto } from '@api/collections/bookmarks/dto/update-bookmark.dto';
import { BookmarksService } from '@api/collections/bookmarks/services/bookmarks.service';
import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import type { User } from '@clerk/backend';
import { BookmarkCategory } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('BookmarksController', () => {
  let controller: BookmarksController;
  let bookmarksService: BookmarksService;

  const mockUserId = '507f1f77bcf86cd799439012';
  const mockOrgId = '507f1f77bcf86cd799439013';
  const mockBrandId = '507f1f77bcf86cd799439014';

  const mockBookmark = {
    _id: '507f1f77bcf86cd799439011',
    brand: mockBrandId,
    category: BookmarkCategory.URL,
    content: 'Test content',
    intent: 'reference',
    isDeleted: false,
    organization: mockOrgId,
    platform: 'twitter',
    savedAt: new Date(),
    title: 'Test Bookmark',
    url: 'https://example.com/article',
    user: mockUserId,
  };

  const mockUser = {
    id: 'user_123',
    publicMetadata: {
      brand: mockBrandId.toString(),
      organization: mockOrgId.toString(),
      user: mockUserId.toString(),
    },
  } as unknown as User;

  const mockRequest = {
    originalUrl: '/api/bookmarks',
    params: {},
    query: {},
  } as unknown as Request;

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockBookmarksService = {
    create: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    patch: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BookmarksController],
      providers: [
        {
          provide: BookmarksService,
          useValue: mockBookmarksService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    })
      .overrideGuard(ClerkGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BookmarksController>(BookmarksController);
    bookmarksService = module.get<BookmarksService>(BookmarksService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a bookmark', async () => {
      const createDto: CreateBookmarkDto = {
        category: 'url',
        content: 'Test content',
        intent: 'reference',
        platform: 'twitter',
        title: 'Test Bookmark',
        url: 'https://example.com/article',
      };

      mockBookmarksService.create.mockResolvedValue(mockBookmark);

      const result = await controller.create(mockRequest, createDto, mockUser);

      expect(bookmarksService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ...createDto,
          organization: 
            mockUser.publicMetadata.organization,
          ,
          savedAt: expect.any(Date),
          user: mockUser.publicMetadata.user,
        }),
      );
      expect(result).toBeDefined();
    });

    it('should handle errors when creating bookmark', async () => {
      const createDto: CreateBookmarkDto = {
        category: 'url',
        intent: 'reference',
        platform: 'twitter',
        title: 'Test Bookmark',
        url: 'https://example.com/article',
      };

      mockBookmarksService.create.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(
        controller.create(mockRequest, createDto, mockUser),
      ).rejects.toThrow('Database error');
    });
  });

  describe('findAll', () => {
    it('should return paginated bookmarks', async () => {
      const query: BookmarksQueryDto = {
        limit: 10,
        page: 1,
      };

      const mockData = {
        docs: [mockBookmark],
        limit: 10,
        page: 1,
        pages: 1,
        total: 1,
      };

      mockBookmarksService.findAll.mockResolvedValue(mockData);

      const result = await controller.findAll(mockRequest, mockUser, query);

      expect(bookmarksService.findAll).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should filter by category', async () => {
      const query: BookmarksQueryDto = {
        category: 'tweet',
        limit: 10,
        page: 1,
      };

      mockBookmarksService.findAll.mockResolvedValue({
        docs: [mockBookmark],
        total: 1,
      });

      const result = await controller.findAll(mockRequest, mockUser, query);

      expect(bookmarksService.findAll).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            $match: expect.objectContaining({
              category: 'tweet',
            }),
          }),
        ]),
        expect.any(Object),
      );
      expect(result).toBeDefined();
    });

    it('should filter by platform', async () => {
      const query: BookmarksQueryDto = {
        limit: 10,
        page: 1,
        platform: 'twitter',
      };

      mockBookmarksService.findAll.mockResolvedValue({
        docs: [mockBookmark],
        total: 1,
      });

      const result = await controller.findAll(mockRequest, mockUser, query);

      expect(result).toBeDefined();
    });

    it('should search bookmarks', async () => {
      const query: BookmarksQueryDto = {
        limit: 10,
        page: 1,
        search: 'test',
      };

      mockBookmarksService.findAll.mockResolvedValue({
        docs: [mockBookmark],
        total: 1,
      });

      const result = await controller.findAll(mockRequest, mockUser, query);

      expect(result).toBeDefined();
    });
  });

  describe('findOne', () => {
    it('should return a bookmark by id', async () => {
      const bookmarkId = '507f1f77bcf86cd799439011';

      mockBookmarksService.findOne.mockResolvedValue(mockBookmark);

      const result = await controller.findOne(
        mockRequest,
        bookmarkId,
        mockUser,
      );

      expect(bookmarksService.findOne).toHaveBeenCalledWith({
        _id: bookmarkId,
        organization: mockUser.publicMetadata.organization,
        user: mockUser.publicMetadata.user,
      });
      expect(result).toBeDefined();
    });

    it('should throw HttpException when bookmark does not exist', async () => {
      const bookmarkId = '507f1f77bcf86cd799439011';

      mockBookmarksService.findOne.mockResolvedValue(null);

      await expect(
        controller.findOne(mockRequest, bookmarkId, mockUser),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('update', () => {
    it('should update a bookmark', async () => {
      const bookmarkId = '507f1f77bcf86cd799439011';
      const updateDto: UpdateBookmarkDto = {
        title: 'Updated Title',
      };

      const updatedBookmark = { ...mockBookmark, ...updateDto };

      mockBookmarksService.findOne
        .mockResolvedValueOnce(mockBookmark)
        .mockResolvedValueOnce(updatedBookmark);
      mockBookmarksService.patch.mockResolvedValue(undefined);

      const result = await controller.update(
        mockRequest,
        bookmarkId,
        updateDto,
        mockUser,
      );

      expect(bookmarksService.patch).toHaveBeenCalledWith(
        bookmarkId,
        expect.objectContaining(updateDto),
      );
      expect(result).toBeDefined();
    });

    it('should throw HttpException when bookmark does not exist', async () => {
      const bookmarkId = '507f1f77bcf86cd799439011';
      const updateDto: UpdateBookmarkDto = {
        title: 'Updated Title',
      };

      mockBookmarksService.findOne.mockResolvedValue(null);

      await expect(
        controller.update(mockRequest, bookmarkId, updateDto, mockUser),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('remove', () => {
    it('should soft delete a bookmark', async () => {
      const bookmarkId = '507f1f77bcf86cd799439011';

      mockBookmarksService.findOne.mockResolvedValue(mockBookmark);
      mockBookmarksService.patch.mockResolvedValue(undefined);

      const result = await controller.remove(bookmarkId, mockUser);

      expect(bookmarksService.patch).toHaveBeenCalledWith(bookmarkId, {
        isDeleted: true,
      });
      expect(result).toEqual({
        data: {
          attributes: {
            message: 'Bookmark deleted successfully',
          },
          id: bookmarkId,
          type: 'bookmark',
        },
      });
    });

    it('should throw HttpException when bookmark does not exist', async () => {
      const bookmarkId = '507f1f77bcf86cd799439011';

      mockBookmarksService.findOne.mockResolvedValue(null);

      await expect(controller.remove(bookmarkId, mockUser)).rejects.toThrow(
        HttpException,
      );
    });
  });
});
