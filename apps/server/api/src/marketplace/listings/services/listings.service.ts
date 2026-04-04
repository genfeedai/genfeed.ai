import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import type { CreateListingDto } from '@api/marketplace/listings/dto/create-listing.dto';
import type { ListingQueryDto } from '@api/marketplace/listings/dto/listing-query.dto';
import type { UpdateListingDto } from '@api/marketplace/listings/dto/update-listing.dto';
import { ListingEntity } from '@api/marketplace/listings/entities/listing.entity';
import { Listing } from '@api/marketplace/listings/schemas/listing.schema';
import { SellersService } from '@api/marketplace/sellers/services/sellers.service';
import { BaseService } from '@api/shared/services/base/base.service';
import type {
  AggregatePaginateModel,
  AggregatePaginateResult,
} from '@api/types/mongoose-aggregate-paginate-v2';
import { ListingStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type PipelineStage, Types } from 'mongoose';
import slugify from 'slugify';

@Injectable()
export class ListingsService extends BaseService<
  Listing,
  CreateListingDto,
  UpdateListingDto
> {
  constructor(
    @InjectModel(Listing.name, DB_CONNECTIONS.MARKETPLACE)
    protected readonly model: AggregatePaginateModel<Listing>,
    public readonly logger: LoggerService,
    private readonly sellersService: SellersService,
  ) {
    super(model, logger);
  }

  /**
   * Generate a unique listing slug from seller slug and title
   */
  @HandleErrors('generate listing slug', 'listings')
  async generateListingSlug(
    sellerSlug: string,
    title: string,
  ): Promise<string> {
    const titleSlug = slugify(title, {
      lower: true,
      strict: true,
      trim: true,
    });

    const baseSlug = `${sellerSlug}/${titleSlug}`;
    let slug = baseSlug;
    let counter = 1;

    while (await this.model.findOne({ slug }).exec()) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    return slug;
  }

  /**
   * Create a new listing
   */
  @HandleErrors('create listing', 'listings')
  async createListing(
    sellerId: string,
    organizationId: string,
    dto: CreateListingDto,
  ): Promise<Listing> {
    this.logOperation('createListing', 'started', { sellerId });

    const seller = await this.sellersService.findOne({
      _id: sellerId,
      isDeleted: false,
    });

    if (!seller) {
      throw new NotFoundException('Seller not found');
    }

    const slug = await this.generateListingSlug(seller.slug, dto.title);

    const listingEntity = new ListingEntity({
      ...dto,
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
      seller: new Types.ObjectId(sellerId),
      slug,
      status: ListingStatus.DRAFT,
    });

    const listing = await this.create(
      listingEntity as unknown as CreateListingDto,
    );

    this.logOperation('createListing', 'completed', {
      listingId: listing._id,
      sellerId,
    });

    return listing;
  }

  /**
   * Submit listing for review
   */
  @HandleErrors('submit for review', 'listings')
  async submitForReview(listingId: string, sellerId: string): Promise<Listing> {
    this.logOperation('submitForReview', 'started', { listingId, sellerId });

    const listing = await this.model
      .findOne({
        _id: listingId,
        isDeleted: false,
        seller: new Types.ObjectId(sellerId),
      })
      .exec();

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.status !== ListingStatus.DRAFT) {
      throw new BadRequestException(
        'Only draft listings can be submitted for review',
      );
    }

    const updated = await this.patch(listingId, {
      status: ListingStatus.PENDING_REVIEW,
    });

    this.logOperation('submitForReview', 'completed', { listingId });

    return updated;
  }

  /**
   * Approve or reject a pending listing review.
   */
  @HandleErrors('review listing', 'listings')
  async reviewListing(
    listingId: string,
    isApproved: boolean,
    reason?: string,
  ): Promise<Listing> {
    this.logOperation('reviewListing', 'started', {
      isApproved,
      listingId,
    });

    const listing = await this.model
      .findOne({
        _id: listingId,
        isDeleted: false,
      })
      .exec();

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.status !== ListingStatus.PENDING_REVIEW) {
      throw new BadRequestException(
        'Only pending_review listings can be moderated',
      );
    }

    const updatePayload: Partial<Listing> = isApproved
      ? {
          publishedAt: new Date(),
          rejectionReason: undefined,
          status: ListingStatus.PUBLISHED,
        }
      : {
          rejectionReason: reason || 'Rejected by moderator',
          status: ListingStatus.REJECTED,
        };

    const updated = await this.patch(listingId, updatePayload);

    this.logOperation('reviewListing', 'completed', {
      isApproved,
      listingId,
      status: updated.status,
    });

    return updated;
  }

  /**
   * Get listings for a specific seller
   */
  @HandleErrors('get seller listings', 'listings')
  getSellerListings(
    sellerId: string,
    query: ListingQueryDto,
  ): Promise<AggregatePaginateResult<Listing>> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const matchConditions: Record<string, unknown> = {
      isDeleted: false,
      seller: new Types.ObjectId(sellerId),
    };

    if (query.type) {
      matchConditions.type = query.type;
    }

    if (query.status) {
      matchConditions.status = query.status;
    }

    const aggregate: PipelineStage[] = [
      { $match: matchConditions },
      { $sort: handleQuerySort(query.sort) },
    ];

    return this.findAll(aggregate, options);
  }

  /**
   * Escape special regex characters in a string
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Get public published listings
   */
  @HandleErrors('get public listings', 'listings')
  async getPublicListings(
    query: ListingQueryDto,
  ): Promise<AggregatePaginateResult<Listing>> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const matchConditions: Record<string, unknown> = {
      isDeleted: false,
      status: ListingStatus.PUBLISHED,
    };

    if (query.type) {
      matchConditions.type = query.type;
    }

    if (query.tags && query.tags.length > 0) {
      matchConditions.tags = { $in: query.tags };
    }

    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      matchConditions.price = {};
      if (query.minPrice !== undefined) {
        (matchConditions.price as Record<string, number>).$gte = query.minPrice;
      }
      if (query.maxPrice !== undefined) {
        (matchConditions.price as Record<string, number>).$lte = query.maxPrice;
      }
    }

    if (query.pricingTier) {
      matchConditions.pricingTier = query.pricingTier;
    }

    if (query.isOfficial !== undefined) {
      matchConditions.isOfficial = query.isOfficial;
    }

    // Resolve sellerSlug to seller ObjectId
    if (query.sellerSlug) {
      const seller = await this.sellersService.findBySlug(query.sellerSlug);
      if (!seller) {
        return {
          data: [],
          meta: { limit: options.limit ?? 20, page: 1, pages: 0, total: 0 },
        } as unknown as AggregatePaginateResult<Listing>;
      }
      matchConditions.seller = seller._id;
    }

    // Sanitize search: cap length and escape regex special characters
    const sanitizedSearch = query.search
      ? this.escapeRegex(query.search.slice(0, 200))
      : undefined;

    const aggregate: PipelineStage[] = [
      { $match: matchConditions },
      ...(sanitizedSearch
        ? [
            {
              $match: {
                $or: [
                  { title: { $options: 'i', $regex: sanitizedSearch } },
                  {
                    shortDescription: {
                      $options: 'i',
                      $regex: sanitizedSearch,
                    },
                  },
                  { description: { $options: 'i', $regex: sanitizedSearch } },
                ],
              },
            },
          ]
        : []),
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
   * Get admin listings scoped to organization.
   */
  @HandleErrors('get admin listings', 'listings')
  async getAdminListings(
    organizationId: string,
    query: ListingQueryDto,
  ): Promise<AggregatePaginateResult<Listing>> {
    this.logOperation('getAdminListings', 'started', {
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

    if (query.type) {
      matchConditions.type = query.type;
    }

    const sanitizedSearch = query.search
      ? this.escapeRegex(query.search.slice(0, 200))
      : undefined;

    const aggregate: PipelineStage[] = [
      { $match: matchConditions },
      ...(sanitizedSearch
        ? [
            {
              $match: {
                $or: [
                  { title: { $options: 'i', $regex: sanitizedSearch } },
                  {
                    shortDescription: {
                      $options: 'i',
                      $regex: sanitizedSearch,
                    },
                  },
                  { slug: { $options: 'i', $regex: sanitizedSearch } },
                ],
              },
            },
          ]
        : []),
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

    const result = await this.findAll(aggregate, options);

    this.logOperation('getAdminListings', 'completed', {
      count: result.data?.length ?? 0,
      organizationId,
    });

    return result;
  }

  /**
   * Get a single admin listing scoped to organization.
   */
  @HandleErrors('get admin listing', 'listings')
  async getAdminListingById(
    organizationId: string,
    listingId: string,
  ): Promise<Listing | null> {
    this.logOperation('getAdminListingById', 'started', {
      listingId,
      organizationId,
    });

    const listing = await this.model
      .findOne({
        _id: listingId,
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      })
      .populate('seller')
      .exec();

    this.logOperation('getAdminListingById', 'completed', {
      found: Boolean(listing),
      listingId,
      organizationId,
    });

    return listing;
  }

  /**
   * Find listing by full slug (seller-slug/listing-slug)
   */
  @HandleErrors('find by slug', 'listings')
  findBySlug(fullSlug: string): Promise<Listing | null> {
    return this.model
      .findOne({
        isDeleted: false,
        slug: fullSlug,
        status: ListingStatus.PUBLISHED,
      })
      .populate('seller')
      .exec();
  }

  /**
   * Get published listing by ID
   */
  @HandleErrors('get published listing', 'listings')
  getPublishedListing(listingId: string): Promise<Listing | null> {
    return this.model
      .findOne({
        _id: listingId,
        isDeleted: false,
        status: ListingStatus.PUBLISHED,
      })
      .populate('seller')
      .exec();
  }

  /**
   * Increment view count
   */
  @HandleErrors('increment views', 'listings')
  async incrementViews(listingId: string): Promise<void> {
    await this.model
      .findByIdAndUpdate(listingId, { $inc: { views: 1 } })
      .exec();
  }

  /**
   * Update listing statistics
   */
  @HandleErrors('update listing stats', 'listings')
  updateListingStats(
    listingId: string,
    increments: {
      downloads?: number;
      purchases?: number;
      likeCount?: number;
      revenue?: number;
    },
  ): Promise<Listing | null> {
    return this.model
      .findByIdAndUpdate(
        listingId,
        { $inc: increments },
        { returnDocument: 'after' },
      )
      .exec();
  }

  /**
   * Get featured listings (official, highest rated)
   */
  @HandleErrors('get featured listings', 'listings')
  getFeaturedListings(
    limit: number = 12,
  ): Promise<AggregatePaginateResult<Listing>> {
    const options = {
      customLabels,
      limit,
      page: 1,
    };

    const aggregate: PipelineStage[] = [
      {
        $match: {
          isDeleted: false,
          isOfficial: true,
          status: ListingStatus.PUBLISHED,
        },
      },
      {
        $lookup: {
          as: 'sellerData',
          foreignField: '_id',
          from: 'sellers',
          localField: 'seller',
        },
      },
      { $unwind: { path: '$sellerData', preserveNullAndEmptyArrays: true } },
      { $sort: { purchases: -1, rating: -1 } },
    ];

    return this.findAll(aggregate, options);
  }

  /**
   * Get category counts for published listings
   */
  @HandleErrors('get categories', 'listings')
  async getCategoryCounts(): Promise<Array<{ type: string; count: number }>> {
    const result = await this.model.aggregate([
      {
        $match: {
          isDeleted: false,
          status: ListingStatus.PUBLISHED,
        },
      },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          count: 1,
          type: '$_id',
        },
      },
    ]);

    return result;
  }

  /**
   * Increment install count
   */
  @HandleErrors('increment install count', 'listings')
  async incrementInstallCount(listingId: string): Promise<void> {
    await this.model
      .findByIdAndUpdate(listingId, { $inc: { installCount: 1 } })
      .exec();
  }

  /**
   * Find listing by package source and slug (for seed upsert)
   */
  @HandleErrors('find by package source', 'listings')
  findByPackageSource(
    packageSource: string,
    packageSlug: string,
  ): Promise<Listing | null> {
    return this.model
      .findOne({
        isDeleted: false,
        packageSlug,
        packageSource,
      })
      .exec();
  }

  /**
   * Archive a listing (soft delete for sellers)
   */
  @HandleErrors('archive listing', 'listings')
  async archiveListing(listingId: string, sellerId: string): Promise<Listing> {
    const listing = await this.model
      .findOne({
        _id: listingId,
        isDeleted: false,
        seller: new Types.ObjectId(sellerId),
      })
      .exec();

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    return this.patch(listingId, { status: ListingStatus.ARCHIVED });
  }
}
