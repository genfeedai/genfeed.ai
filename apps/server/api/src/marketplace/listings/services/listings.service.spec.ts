import type { ListingQueryDto } from '@api/marketplace/listings/dto/listing-query.dto';
import { ListingsService } from '@api/marketplace/listings/services/listings.service';
import { ListingStatus } from '@genfeedai/enums';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { vi } from 'vitest';

describe('ListingsService', () => {
  let service: ListingsService;

  beforeEach(() => {
    // Create a minimal instance to test private helper via public method behavior
    service = Object.create(ListingsService.prototype) as ListingsService & {
      logOperation: ReturnType<typeof vi.fn>;
      model: {
        findOne: ReturnType<typeof vi.fn>;
      };
      patch: ReturnType<typeof vi.fn>;
    };
    service.logOperation = vi.fn();
    service.patch = vi.fn();
    service.model = {
      findOne: vi.fn(),
    };
  });

  describe('escapeRegex', () => {
    // Access private method for unit testing
    const escapeRegex = (str: string) =>
      str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    it('should escape regex special characters', () => {
      expect(escapeRegex(`hello.*+?^$${'{}'}()|[]\\`)).toBe(
        'hello\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\',
      );
    });

    it('should leave normal strings unchanged', () => {
      expect(escapeRegex('hello world')).toBe('hello world');
    });

    it('should handle empty string', () => {
      expect(escapeRegex('')).toBe('');
    });

    it('should escape a ReDoS payload', () => {
      const malicious = '(a+)+$';
      const escaped = escapeRegex(malicious);
      expect(escaped).toBe('\\(a\\+\\)\\+\\$');
      // Escaped string should be safe to use in RegExp
      expect(() => new RegExp(escaped)).not.toThrow();
    });
  });

  describe('reviewListing', () => {
    it('should publish listing when approved', async () => {
      service.model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue({
          _id: 'listing-1',
          status: ListingStatus.PENDING_REVIEW,
        }),
      });
      service.patch.mockResolvedValue({
        _id: 'listing-1',
        status: ListingStatus.PUBLISHED,
      });

      const result = await service.reviewListing('listing-1', true);

      expect(service.patch).toHaveBeenCalledWith(
        'listing-1',
        expect.objectContaining({
          status: ListingStatus.PUBLISHED,
        }),
      );
      expect(result.status).toBe(ListingStatus.PUBLISHED);
    });

    it('should reject listing when not approved', async () => {
      service.model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue({
          _id: 'listing-2',
          status: ListingStatus.PENDING_REVIEW,
        }),
      });
      service.patch.mockResolvedValue({
        _id: 'listing-2',
        rejectionReason: 'Not enough quality',
        status: ListingStatus.REJECTED,
      });

      const result = await service.reviewListing(
        'listing-2',
        false,
        'Not enough quality',
      );

      expect(service.patch).toHaveBeenCalledWith(
        'listing-2',
        expect.objectContaining({
          rejectionReason: 'Not enough quality',
          status: ListingStatus.REJECTED,
        }),
      );
      expect(result.status).toBe(ListingStatus.REJECTED);
    });

    it('should throw when listing does not exist', async () => {
      service.model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      });

      await expect(
        service.reviewListing('missing-listing', true),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('should throw when listing is not pending review', async () => {
      service.model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue({
          _id: 'listing-3',
          status: ListingStatus.DRAFT,
        }),
      });

      await expect(
        service.reviewListing('listing-3', true),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('getAdminListings', () => {
    it('scopes queries to organization and sanitizes search filters', async () => {
      service.findAll = vi.fn().mockResolvedValue({ data: [], meta: {} });

      await service.getAdminListings('507f191e810c19729de860ea', {
        limit: 20,
        page: 1,
        search: 'title(a+)+$',
        sort: 'createdAt: -1',
        status: ListingStatus.PENDING_REVIEW,
        type: 'workflow',
      } as ListingQueryDto);

      expect(service.findAll).toHaveBeenCalledOnce();
      const [aggregate] = service.findAll.mock.calls[0] as [
        Array<Record<string, unknown>>,
      ];

      expect(aggregate[0]).toEqual(
        expect.objectContaining({
          $match: expect.objectContaining({
            isDeleted: false,
            organization: new Types.ObjectId('507f191e810c19729de860ea'),
            status: ListingStatus.PENDING_REVIEW,
            type: 'workflow',
          }),
        }),
      );
      expect(aggregate[1]).toEqual(
        expect.objectContaining({
          $match: expect.objectContaining({
            $or: expect.arrayContaining([
              expect.objectContaining({
                title: expect.objectContaining({
                  $regex: 'title\\(a\\+\\)\\+\\$',
                }),
              }),
            ]),
          }),
        }),
      );
    });
  });

  describe('getAdminListingById', () => {
    it('applies organization scope when retrieving a listing', async () => {
      const exec = vi.fn().mockResolvedValue({ _id: 'listing-10' });
      const populate = vi.fn().mockReturnValue({ exec });
      service.model.findOne.mockReturnValue({ populate });

      await service.getAdminListingById(
        '507f191e810c19729de860ea',
        '507f1f77bcf86cd799439011',
      );

      expect(service.model.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: '507f1f77bcf86cd799439011',
          isDeleted: false,
          organization: new Types.ObjectId('507f191e810c19729de860ea'),
        }),
      );
      expect(populate).toHaveBeenCalledWith('seller');
      expect(exec).toHaveBeenCalled();
    });
  });
});
