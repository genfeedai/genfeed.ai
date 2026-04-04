import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { ListingsService } from '@api/marketplace/listings/services/listings.service';
import { CreatePurchaseDto } from '@api/marketplace/purchases/dto/create-purchase.dto';
import { PurchaseQueryDto } from '@api/marketplace/purchases/dto/purchase-query.dto';
import { PurchaseEntity } from '@api/marketplace/purchases/entities/purchase.entity';
import { Purchase } from '@api/marketplace/purchases/schemas/purchase.schema';
import { SellersService } from '@api/marketplace/sellers/services/sellers.service';
import { BaseService } from '@api/shared/services/base/base.service';
import type {
  AggregatePaginateModel,
  AggregatePaginateResult,
} from '@api/types/mongoose-aggregate-paginate-v2';
import { PurchaseStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type PipelineStage, Types } from 'mongoose';

// Platform commission rate (15%)
const PLATFORM_COMMISSION_RATE = 0.15;

@Injectable()
export class PurchasesService extends BaseService<
  Purchase,
  CreatePurchaseDto,
  Partial<Purchase>
> {
  constructor(
    @InjectModel(Purchase.name, DB_CONNECTIONS.MARKETPLACE)
    protected readonly model: AggregatePaginateModel<Purchase>,
    public readonly logger: LoggerService,
    private readonly listingsService: ListingsService,
    private readonly sellersService: SellersService,
  ) {
    super(model, logger);
  }

  /**
   * Check if user has already purchased a listing
   */
  @HandleErrors('check purchase', 'purchases')
  async hasAlreadyPurchased(
    listingId: string,
    buyerId: string,
  ): Promise<boolean> {
    const existing = await this.model
      .findOne({
        buyer: new Types.ObjectId(buyerId),
        isDeleted: false,
        listing: new Types.ObjectId(listingId),
        status: PurchaseStatus.COMPLETED,
      })
      .exec();

    return !!existing;
  }

  /**
   * Calculate platform commission
   */
  calculateCommission(price: number): {
    platformFee: number;
    sellerEarnings: number;
  } {
    const platformFee = Math.round(price * PLATFORM_COMMISSION_RATE);
    const sellerEarnings = price - platformFee;
    return { platformFee, sellerEarnings };
  }

  /**
   * Claim a free listing (price = 0)
   */
  @HandleErrors('claim free item', 'purchases')
  async claimFreeItem(
    listingId: string,
    buyerId: string,
    organizationId: string,
  ): Promise<Purchase> {
    this.logOperation('claimFreeItem', 'started', { buyerId, listingId });

    // Check if already purchased
    const alreadyPurchased = await this.hasAlreadyPurchased(listingId, buyerId);
    if (alreadyPurchased) {
      throw new BadRequestException('You already own this item');
    }

    // Get the listing
    const listing = await this.listingsService.getPublishedListing(listingId);
    if (!listing) {
      throw new NotFoundException('Listing not found');
    }
    if (listing.pricingTier === 'premium') {
      throw new BadRequestException(
        'Premium listings cannot be claimed as free items.',
      );
    }

    if (listing.price > 0) {
      throw new BadRequestException(
        'This item is not free. Please use the checkout flow.',
      );
    }

    // Create purchase record
    const purchaseEntity = new PurchaseEntity({
      buyer: new Types.ObjectId(buyerId),
      currency: listing.currency,
      discount: 0,
      isDeleted: false,
      listing: new Types.ObjectId(listingId),
      listingSnapshot: {
        price: listing.price,
        title: listing.title,
        type: listing.type,
        version: listing.version,
      },
      organization: new Types.ObjectId(organizationId),
      platformFee: 0,
      seller: listing.seller,
      sellerEarnings: 0,
      status: PurchaseStatus.COMPLETED,
      subtotal: 0,
      total: 0,
    });

    const purchase = await this.create(
      purchaseEntity as unknown as CreatePurchaseDto,
    );

    // Update listing stats
    await this.listingsService.updateListingStats(listingId, {
      downloads: 1,
      purchases: 1,
    });

    // Update seller stats
    await this.sellersService.incrementSellerStats(listing.seller.toString(), {
      totalSales: 1,
    });

    this.logOperation('claimFreeItem', 'completed', {
      buyerId,
      listingId,
      purchaseId: purchase._id,
    });

    return purchase;
  }

  /**
   * Create a purchase (for paid items - Phase 4)
   */
  @HandleErrors('create purchase', 'purchases')
  async createPurchase(
    buyerId: string,
    organizationId: string,
    dto: CreatePurchaseDto,
  ): Promise<Purchase> {
    this.logOperation('createPurchase', 'started', {
      buyerId,
      listingId: dto.listingId,
    });

    // Check if already purchased
    const alreadyPurchased = await this.hasAlreadyPurchased(
      dto.listingId,
      buyerId,
    );
    if (alreadyPurchased) {
      throw new BadRequestException('You already own this item');
    }

    // Get the listing
    const listing = await this.listingsService.getPublishedListing(
      dto.listingId,
    );
    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    // Calculate commission
    const { platformFee, sellerEarnings } = this.calculateCommission(
      listing.price,
    );

    // Create purchase record
    const purchaseEntity = new PurchaseEntity({
      buyer: new Types.ObjectId(buyerId),
      currency: listing.currency,
      discount: 0,
      discountCode: dto.discountCode,
      giftMessage: dto.giftMessage,
      giftRecipient: dto.giftRecipientId
        ? new Types.ObjectId(dto.giftRecipientId)
        : undefined,
      isDeleted: false,
      isGift: !!dto.giftRecipientId,
      listing: new Types.ObjectId(dto.listingId),
      listingSnapshot: {
        price: listing.price,
        title: listing.title,
        type: listing.type,
        version: listing.version,
      },
      organization: new Types.ObjectId(organizationId),
      platformFee,
      seller: listing.seller,
      sellerEarnings,
      status:
        listing.price === 0 ? PurchaseStatus.COMPLETED : PurchaseStatus.PENDING,
      subtotal: listing.price,
      total: listing.price,
    });

    const purchase = await this.create(
      purchaseEntity as unknown as CreatePurchaseDto,
    );

    // If free, complete immediately
    if (listing.price === 0) {
      await this.listingsService.updateListingStats(dto.listingId, {
        downloads: 1,
        purchases: 1,
      });

      await this.sellersService.incrementSellerStats(
        listing.seller.toString(),
        { totalSales: 1 },
      );
    }

    this.logOperation('createPurchase', 'completed', {
      buyerId,
      purchaseId: purchase._id,
    });

    return purchase;
  }

  /**
   * Complete a purchase (after payment)
   */
  @HandleErrors('complete purchase', 'purchases')
  async completePurchase(purchaseId: string): Promise<Purchase> {
    this.logOperation('completePurchase', 'started', { purchaseId });

    const purchase = await this.model.findById(purchaseId).exec();
    if (!purchase) {
      throw new NotFoundException('Purchase not found');
    }

    if (purchase.status === PurchaseStatus.COMPLETED) {
      return purchase;
    }

    const updated = await this.patch(purchaseId, {
      status: PurchaseStatus.COMPLETED,
    });

    // Update stats
    await this.listingsService.updateListingStats(purchase.listing.toString(), {
      purchases: 1,
      revenue: purchase.total,
    });

    await this.sellersService.incrementSellerStats(purchase.seller.toString(), {
      totalEarnings: purchase.sellerEarnings,
      totalSales: 1,
    });

    this.logOperation('completePurchase', 'completed', { purchaseId });

    return updated;
  }

  /**
   * Track download
   */
  @HandleErrors('track download', 'purchases')
  async trackDownload(purchaseId: string): Promise<void> {
    await this.model
      .findByIdAndUpdate(purchaseId, {
        $inc: { downloadCount: 1 },
        $set: { lastDownloadedAt: new Date() },
      })
      .exec();

    // Also increment listing download count
    const purchase = await this.model.findById(purchaseId).exec();
    if (purchase) {
      await this.listingsService.updateListingStats(
        purchase.listing.toString(),
        { downloads: 1 },
      );
    }
  }

  /**
   * Get buyer's purchases
   */
  @HandleErrors('get buyer purchases', 'purchases')
  getBuyerPurchases(
    buyerId: string,
    organizationId: string,
    query: PurchaseQueryDto,
  ): Promise<AggregatePaginateResult<Purchase>> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const matchConditions: Record<string, unknown> = {
      buyer: new Types.ObjectId(buyerId),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    };

    if (query.status) {
      matchConditions.status = query.status;
    }

    const aggregate: PipelineStage[] = [
      { $match: matchConditions },
      {
        $lookup: {
          as: 'listingData',
          foreignField: '_id',
          from: 'listings',
          localField: 'listing',
        },
      },
      { $unwind: { path: '$listingData', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          as: 'sellerData',
          foreignField: '_id',
          from: 'sellers',
          localField: 'seller',
        },
      },
      { $unwind: { path: '$sellerData', preserveNullAndEmptyArrays: true } },
      { $sort: handleQuerySort(query.sort) },
    ];

    return this.findAll(aggregate, options);
  }

  /**
   * Verify purchase ownership
   */
  @HandleErrors('verify ownership', 'purchases')
  async verifyOwnership(
    purchaseId: string,
    userId: string,
    organizationId: string,
  ): Promise<{ owned: boolean; purchase?: Purchase }> {
    const purchase = await this.model
      .findOne({
        _id: purchaseId,
        buyer: new Types.ObjectId(userId),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
        status: PurchaseStatus.COMPLETED,
      })
      .exec();

    if (!purchase) {
      return { owned: false };
    }

    return { owned: true, purchase };
  }

  /**
   * Check if user owns a listing
   */
  @HandleErrors('check listing ownership', 'purchases')
  async checkListingOwnership(
    listingId: string,
    userId: string,
    organizationId: string,
  ): Promise<{ owned: boolean; purchase?: Purchase }> {
    const purchase = await this.model
      .findOne({
        buyer: new Types.ObjectId(userId),
        isDeleted: false,
        listing: new Types.ObjectId(listingId),
        organization: new Types.ObjectId(organizationId),
        status: PurchaseStatus.COMPLETED,
      })
      .exec();

    if (!purchase) {
      return { owned: false };
    }

    return { owned: true, purchase };
  }

  /**
   * Get seller's sales (paginated with listing lookup)
   */
  @HandleErrors('get seller sales', 'purchases')
  getSellerSales(
    sellerId: string,
    query: PurchaseQueryDto,
  ): Promise<AggregatePaginateResult<Purchase>> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const matchConditions: Record<string, unknown> = {
      isDeleted: false,
      seller: new Types.ObjectId(sellerId),
    };

    if (query.status) {
      matchConditions.status = query.status;
    }

    const aggregate: PipelineStage[] = [
      { $match: matchConditions },
      {
        $lookup: {
          as: 'listingData',
          foreignField: '_id',
          from: 'listings',
          localField: 'listing',
        },
      },
      { $unwind: { path: '$listingData', preserveNullAndEmptyArrays: true } },
      { $sort: handleQuerySort(query.sort) },
    ];

    return this.findAll(aggregate, options);
  }

  /**
   * Get seller analytics: totals + 30-day daily breakdown
   */
  @HandleErrors('get seller analytics', 'purchases')
  async getSellerAnalytics(sellerId: string): Promise<{
    totalSales: number;
    totalRevenue: number;
    totalEarnings: number;
    totalPlatformFees: number;
    completedOrders: number;
    pendingOrders: number;
    recentSales: Array<{ date: string; count: number; revenue: number }>;
  }> {
    const sellerObjectId = new Types.ObjectId(sellerId);

    // Aggregate totals
    const totalsResult = await this.model
      .aggregate([
        { $match: { isDeleted: false, seller: sellerObjectId } },
        {
          $group: {
            _id: null,
            completedOrders: {
              $sum: {
                $cond: [{ $eq: ['$status', PurchaseStatus.COMPLETED] }, 1, 0],
              },
            },
            pendingOrders: {
              $sum: {
                $cond: [{ $eq: ['$status', PurchaseStatus.PENDING] }, 1, 0],
              },
            },
            totalEarnings: { $sum: '$sellerEarnings' },
            totalPlatformFees: { $sum: '$platformFee' },
            totalRevenue: { $sum: '$total' },
            totalSales: { $sum: 1 },
          },
        },
      ])
      .exec();

    const totals = totalsResult[0] || {
      completedOrders: 0,
      pendingOrders: 0,
      totalEarnings: 0,
      totalPlatformFees: 0,
      totalRevenue: 0,
      totalSales: 0,
    };

    // 30-day daily breakdown
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dailyResult = await this.model
      .aggregate([
        {
          $match: {
            createdAt: { $gte: thirtyDaysAgo },
            isDeleted: false,
            seller: sellerObjectId,
            status: PurchaseStatus.COMPLETED,
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { date: '$createdAt', format: '%Y-%m-%d' },
            },
            count: { $sum: 1 },
            revenue: { $sum: '$total' },
          },
        },
        { $sort: { _id: 1 } },
        {
          $project: {
            _id: 0,
            count: 1,
            date: '$_id',
            revenue: 1,
          },
        },
      ])
      .exec();

    return {
      completedOrders: totals.completedOrders,
      pendingOrders: totals.pendingOrders,
      recentSales: dailyResult,
      totalEarnings: totals.totalEarnings,
      totalPlatformFees: totals.totalPlatformFees,
      totalRevenue: totals.totalRevenue,
      totalSales: totals.totalSales,
    };
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  @HandleErrors('get admin purchases', 'purchases')
  async getAdminPurchases(
    organizationId: string,
    query: PurchaseQueryDto & { search?: string },
  ): Promise<AggregatePaginateResult<Purchase>> {
    this.logOperation('getAdminPurchases', 'started', {
      organizationId,
      query,
    });

    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const matchConditions: Record<string, unknown> = {
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    };

    if (query.status) {
      matchConditions.status = query.status;
    }

    const sanitizedSearch = query.search
      ? this.escapeRegex(query.search.slice(0, 200))
      : undefined;

    const aggregate: PipelineStage[] = [
      { $match: matchConditions },
      {
        $lookup: {
          as: 'listingData',
          foreignField: '_id',
          from: 'listings',
          localField: 'listing',
        },
      },
      { $unwind: { path: '$listingData', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          as: 'sellerData',
          foreignField: '_id',
          from: 'sellers',
          localField: 'seller',
        },
      },
      { $unwind: { path: '$sellerData', preserveNullAndEmptyArrays: true } },
      ...(sanitizedSearch
        ? [
            {
              $match: {
                $or: [
                  {
                    'listingSnapshot.title': {
                      $options: 'i',
                      $regex: sanitizedSearch,
                    },
                  },
                  {
                    'sellerData.displayName': {
                      $options: 'i',
                      $regex: sanitizedSearch,
                    },
                  },
                  {
                    stripeSessionId: {
                      $options: 'i',
                      $regex: sanitizedSearch,
                    },
                  },
                ],
              },
            },
          ]
        : []),
      { $sort: handleQuerySort(query.sort) },
    ];

    const result = await this.findAll(aggregate, options);

    this.logOperation('getAdminPurchases', 'completed', {
      count: result.data?.length ?? 0,
      organizationId,
    });

    return result;
  }

  @HandleErrors('get admin purchase by id', 'purchases')
  async getAdminPurchaseById(
    organizationId: string,
    purchaseId: string,
  ): Promise<Purchase | null> {
    this.logOperation('getAdminPurchaseById', 'started', {
      organizationId,
      purchaseId,
    });

    const data = await this.getAdminPurchases(organizationId, {
      limit: 1,
      page: 1,
      search: purchaseId,
      sort: 'createdAt: -1',
    });

    const direct = data.data.find(
      (item) => item._id?.toString() === purchaseId,
    );
    if (direct) {
      this.logOperation('getAdminPurchaseById', 'completed', {
        found: true,
        organizationId,
        purchaseId,
        source: 'aggregate',
      });
      return direct;
    }

    const purchase = await this.model
      .findOne({
        _id: purchaseId,
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      })
      .exec();

    this.logOperation('getAdminPurchaseById', 'completed', {
      found: Boolean(purchase),
      organizationId,
      purchaseId,
      source: 'findOne',
    });

    return purchase;
  }

  @HandleErrors('get admin analytics overview', 'purchases')
  async getAdminAnalyticsOverview(
    organizationId: string,
    days: number = 30,
  ): Promise<{
    totalRevenue: number;
    totalSales: number;
    totalPlatformFees: number;
    totalSellerEarnings: number;
    completedOrders: number;
    pendingOrders: number;
    failedOrders: number;
    recentSales: Array<{ date: string; count: number; revenue: number }>;
  }> {
    const organizationObjectId = new Types.ObjectId(organizationId);

    const totalsResult = await this.model
      .aggregate([
        {
          $match: {
            isDeleted: false,
            organization: organizationObjectId,
          },
        },
        {
          $group: {
            _id: null,
            completedOrders: {
              $sum: {
                $cond: [{ $eq: ['$status', PurchaseStatus.COMPLETED] }, 1, 0],
              },
            },
            failedOrders: {
              $sum: {
                $cond: [{ $eq: ['$status', PurchaseStatus.FAILED] }, 1, 0],
              },
            },
            pendingOrders: {
              $sum: {
                $cond: [{ $eq: ['$status', PurchaseStatus.PENDING] }, 1, 0],
              },
            },
            totalPlatformFees: { $sum: '$platformFee' },
            totalRevenue: { $sum: '$total' },
            totalSales: { $sum: 1 },
            totalSellerEarnings: { $sum: '$sellerEarnings' },
          },
        },
      ])
      .exec();

    const totals = totalsResult[0] || {
      completedOrders: 0,
      failedOrders: 0,
      pendingOrders: 0,
      totalPlatformFees: 0,
      totalRevenue: 0,
      totalSales: 0,
      totalSellerEarnings: 0,
    };

    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - Math.max(1, days));

    const recentSales = await this.model
      .aggregate([
        {
          $match: {
            createdAt: { $gte: fromDate },
            isDeleted: false,
            organization: organizationObjectId,
            status: PurchaseStatus.COMPLETED,
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { date: '$createdAt', format: '%Y-%m-%d' },
            },
            count: { $sum: 1 },
            revenue: { $sum: '$total' },
          },
        },
        { $sort: { _id: 1 } },
        {
          $project: {
            _id: 0,
            count: 1,
            date: '$_id',
            revenue: 1,
          },
        },
      ])
      .exec();

    return {
      completedOrders: totals.completedOrders,
      failedOrders: totals.failedOrders,
      pendingOrders: totals.pendingOrders,
      recentSales,
      totalPlatformFees: totals.totalPlatformFees,
      totalRevenue: totals.totalRevenue,
      totalSales: totals.totalSales,
      totalSellerEarnings: totals.totalSellerEarnings,
    };
  }
}
