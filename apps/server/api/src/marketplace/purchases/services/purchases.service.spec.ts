import { ListingsService } from '@api/marketplace/listings/services/listings.service';
import { PurchaseQueryDto } from '@api/marketplace/purchases/dto/purchase-query.dto';
import { Purchase } from '@api/marketplace/purchases/schemas/purchase.schema';
import { PurchasesService } from '@api/marketplace/purchases/services/purchases.service';
import { SellersService } from '@api/marketplace/sellers/services/sellers.service';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { PurchaseStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';

describe('PurchasesService', () => {
  it('rejects premium listings in free-claim flow', async () => {
    const listingId = '507f1f77bcf86cd799439011';
    const buyerId = '507f191e810c19729de860ea';
    const organizationId = '507f191e810c19729de860eb';

    const model = {
      findOne: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      }),
    };

    const listingsService = {
      getPublishedListing: vi.fn().mockResolvedValue({
        _id: 'listing-1',
        price: 0,
        pricingTier: 'premium',
      }),
      updateListingStats: vi.fn(),
    };

    const sellersService = {
      incrementSellerStats: vi.fn(),
    };

    const service = new PurchasesService(
      model as unknown as AggregatePaginateModel<Purchase>,
      {
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService,
      listingsService as unknown as ListingsService,
      sellersService as unknown as SellersService,
    );

    await expect(
      service.claimFreeItem(listingId, buyerId, organizationId),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(listingsService.updateListingStats).not.toHaveBeenCalled();
    expect(sellersService.incrementSellerStats).not.toHaveBeenCalled();
  });

  it('claims free listings and creates completed purchase for library', async () => {
    const listingId = '507f1f77bcf86cd799439011';
    const buyerId = '507f191e810c19729de860ea';
    const organizationId = '507f191e810c19729de860eb';

    const model = {
      findOne: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      }),
    };

    const listingsService = {
      getPublishedListing: vi.fn().mockResolvedValue({
        _id: listingId,
        currency: 'usd',
        price: 0,
        pricingTier: 'free',
        seller: {
          toString: () => '507f191e810c19729de860ec',
        },
        title: 'Free Workflow',
        type: 'workflow',
        version: '1.0.0',
      }),
      updateListingStats: vi.fn().mockResolvedValue(undefined),
    };

    const sellersService = {
      incrementSellerStats: vi.fn().mockResolvedValue(undefined),
    };

    const service = new PurchasesService(
      model as unknown as AggregatePaginateModel<Purchase>,
      {
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService,
      listingsService as unknown as ListingsService,
      sellersService as unknown as SellersService,
    );

    const createdPurchase = {
      _id: '507f191e810c19729de860ed',
      listing: listingId,
      status: 'completed',
    };

    vi.spyOn(service, 'create').mockResolvedValue(
      createdPurchase as unknown as Purchase,
    );

    const result = await service.claimFreeItem(
      listingId,
      buyerId,
      organizationId,
    );

    expect(result).toEqual(createdPurchase);
    expect(listingsService.updateListingStats).toHaveBeenCalledWith(listingId, {
      downloads: 1,
      purchases: 1,
    });
    expect(sellersService.incrementSellerStats).toHaveBeenCalledWith(
      '507f191e810c19729de860ec',
      {
        totalSales: 1,
      },
    );
  });

  describe('verifyOwnership', () => {
    it('includes organizationId in query when provided', async () => {
      const purchaseId = new Types.ObjectId().toString();
      const userId = new Types.ObjectId().toString();
      const orgId = new Types.ObjectId().toString();

      const mockExec = vi.fn().mockResolvedValue({ _id: purchaseId });
      const model = {
        findOne: vi.fn().mockReturnValue({ exec: mockExec }),
      };

      const service = new PurchasesService(
        model as unknown as AggregatePaginateModel<Purchase>,
        {
          error: vi.fn(),
          log: vi.fn(),
          warn: vi.fn(),
        } as unknown as LoggerService,
        {} as unknown as ListingsService,
        {} as unknown as SellersService,
      );

      const result = await service.verifyOwnership(purchaseId, userId, orgId);

      expect(result.owned).toBe(true);
      expect(model.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          buyer: new Types.ObjectId(userId),
          organization: new Types.ObjectId(orgId),
          status: PurchaseStatus.COMPLETED,
        }),
      );
    });

    it('returns not owned when purchase not found', async () => {
      const purchaseId = new Types.ObjectId().toString();
      const userId = new Types.ObjectId().toString();
      const orgId = new Types.ObjectId().toString();

      const mockExec = vi.fn().mockResolvedValue(null);
      const model = {
        findOne: vi.fn().mockReturnValue({ exec: mockExec }),
      };

      const service = new PurchasesService(
        model as unknown as AggregatePaginateModel<Purchase>,
        {
          error: vi.fn(),
          log: vi.fn(),
          warn: vi.fn(),
        } as unknown as LoggerService,
        {} as unknown as ListingsService,
        {} as unknown as SellersService,
      );

      const result = await service.verifyOwnership(purchaseId, userId, orgId);

      expect(result.owned).toBe(false);
      expect(model.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          organization: new Types.ObjectId(orgId),
        }),
      );
    });
  });

  describe('checkListingOwnership', () => {
    it('includes organizationId in query when provided', async () => {
      const listingId = new Types.ObjectId().toString();
      const userId = new Types.ObjectId().toString();
      const orgId = new Types.ObjectId().toString();

      const mockExec = vi.fn().mockResolvedValue({ _id: listingId });
      const model = {
        findOne: vi.fn().mockReturnValue({ exec: mockExec }),
      };

      const service = new PurchasesService(
        model as unknown as AggregatePaginateModel<Purchase>,
        {
          error: vi.fn(),
          log: vi.fn(),
          warn: vi.fn(),
        } as unknown as LoggerService,
        {} as unknown as ListingsService,
        {} as unknown as SellersService,
      );

      await service.checkListingOwnership(listingId, userId, orgId);

      expect(model.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          organization: new Types.ObjectId(orgId),
        }),
      );
    });
  });

  describe('getAdminPurchases', () => {
    it('scopes aggregate queries to organization and sanitizes search', async () => {
      const model = {
        findOne: vi.fn(),
      };

      const service = new PurchasesService(
        model as unknown as AggregatePaginateModel<Purchase>,
        {
          error: vi.fn(),
          log: vi.fn(),
          warn: vi.fn(),
        } as unknown as LoggerService,
        {} as unknown as ListingsService,
        {} as unknown as SellersService,
      );

      const findAllSpy = vi.spyOn(service, 'findAll');
      findAllSpy.mockResolvedValue({
        data: [],
        meta: {},
      } as unknown as Awaited<ReturnType<typeof service.getAdminPurchases>>);

      await service.getAdminPurchases('507f191e810c19729de860ea', {
        limit: 20,
        page: 1,
        search: 'sess_(a+)+$',
        sort: 'createdAt: -1',
      } as PurchaseQueryDto & { search: string });

      const [aggregate] = findAllSpy.mock.calls[0] as unknown as [
        Array<Record<string, unknown>>,
      ];
      expect(aggregate[0]).toEqual(
        expect.objectContaining({
          $match: expect.objectContaining({
            isDeleted: false,
            organization: new Types.ObjectId('507f191e810c19729de860ea'),
          }),
        }),
      );
      expect(aggregate).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            $match: expect.objectContaining({
              $or: expect.arrayContaining([
                expect.objectContaining({
                  stripeSessionId: expect.objectContaining({
                    $regex: 'sess_\\(a\\+\\)\\+\\$',
                  }),
                }),
              ]),
            }),
          }),
        ]),
      );
    });
  });

  describe('getAdminPurchaseById', () => {
    it('returns direct aggregate match without fallback query', async () => {
      const purchaseId = new Types.ObjectId().toString();

      const model = {
        findOne: vi.fn(),
      };

      const service = new PurchasesService(
        model as unknown as AggregatePaginateModel<Purchase>,
        {
          error: vi.fn(),
          log: vi.fn(),
          warn: vi.fn(),
        } as unknown as LoggerService,
        {} as unknown as ListingsService,
        {} as unknown as SellersService,
      );

      vi.spyOn(service, 'getAdminPurchases').mockResolvedValue({
        data: [{ _id: purchaseId }],
      } as unknown as Awaited<ReturnType<typeof service.getAdminPurchases>>);

      const result = await service.getAdminPurchaseById(
        '507f191e810c19729de860ea',
        purchaseId,
      );

      expect(result?._id?.toString()).toBe(purchaseId);
      expect(model.findOne).not.toHaveBeenCalled();
    });

    it('falls back to direct findOne when aggregate does not return exact id', async () => {
      const purchaseId = new Types.ObjectId().toString();
      const exec = vi.fn().mockResolvedValue({ _id: purchaseId });
      const model = {
        findOne: vi.fn().mockReturnValue({ exec }),
      };

      const service = new PurchasesService(
        model as unknown as AggregatePaginateModel<Purchase>,
        {
          error: vi.fn(),
          log: vi.fn(),
          warn: vi.fn(),
        } as unknown as LoggerService,
        {} as unknown as ListingsService,
        {} as unknown as SellersService,
      );

      vi.spyOn(service, 'getAdminPurchases').mockResolvedValue({
        data: [],
      } as unknown as Awaited<ReturnType<typeof service.getAdminPurchases>>);

      await service.getAdminPurchaseById(
        '507f191e810c19729de860ea',
        purchaseId,
      );

      expect(model.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: purchaseId,
          isDeleted: false,
          organization: new Types.ObjectId('507f191e810c19729de860ea'),
        }),
      );
      expect(exec).toHaveBeenCalled();
    });
  });
});
