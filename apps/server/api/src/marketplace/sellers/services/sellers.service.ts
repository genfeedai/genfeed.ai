import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { AdminSellerQueryDto } from '@api/marketplace/sellers/dto/admin-seller-query.dto';
import { CreateSellerDto } from '@api/marketplace/sellers/dto/create-seller.dto';
import { UpdateSellerDto } from '@api/marketplace/sellers/dto/update-seller.dto';
import { SellerEntity } from '@api/marketplace/sellers/entities/seller.entity';
import { Seller } from '@api/marketplace/sellers/schemas/seller.schema';
import { BaseService } from '@api/shared/services/base/base.service';
import type {
  AggregatePaginateModel,
  AggregatePaginateResult,
} from '@api/types/mongoose-aggregate-paginate-v2';
import { SellerBadgeTier, SellerStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type PipelineStage, Types } from 'mongoose';
import slugify from 'slugify';

@Injectable()
export class SellersService extends BaseService<
  Seller,
  CreateSellerDto,
  UpdateSellerDto
> {
  constructor(
    @InjectModel(Seller.name, DB_CONNECTIONS.MARKETPLACE)
    protected readonly model: AggregatePaginateModel<Seller>,
    public readonly logger: LoggerService,
  ) {
    super(model, logger);
  }

  /**
   * Check if a user is eligible to become a seller
   * Currently allows all users (subscription check can be added later)
   */
  @HandleErrors('check seller eligibility', 'sellers')
  async checkSellerEligibility(
    userId: string,
    _organizationId: string,
  ): Promise<{ eligible: boolean; reason?: string }> {
    this.logOperation('checkSellerEligibility', 'started', { userId });

    // Check if user already has a seller profile
    const existingSeller = await this.findByUserId(userId);
    if (existingSeller) {
      return {
        eligible: false,
        reason: 'User already has a seller profile',
      };
    }

    this.logOperation('checkSellerEligibility', 'completed', { userId });
    return { eligible: true };
  }

  /**
   * Generate a unique seller slug from display name
   */
  @HandleErrors('generate seller slug', 'sellers')
  async generateSellerSlug(displayName: string): Promise<string> {
    const baseSlug = slugify(displayName, {
      lower: true,
      strict: true,
      trim: true,
    });

    let slug = baseSlug;
    let counter = 1;

    // Check for uniqueness and append number if needed
    while (await this.model.findOne({ slug }).exec()) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    return slug;
  }

  /**
   * Create a new seller profile
   */
  @HandleErrors('create seller profile', 'sellers')
  async createSellerProfile(
    userId: string,
    organizationId: string,
    dto: CreateSellerDto,
  ): Promise<Seller> {
    this.logOperation('createSellerProfile', 'started', { userId });

    // Check eligibility
    const eligibility = await this.checkSellerEligibility(
      userId,
      organizationId,
    );
    if (!eligibility.eligible) {
      throw new BadRequestException(eligibility.reason);
    }

    // Generate unique slug
    const slug = await this.generateSellerSlug(dto.displayName);

    const sellerEntity = new SellerEntity({
      ...dto,
      badgeTier: SellerBadgeTier.NEW,
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
      slug,
      status: SellerStatus.APPROVED,
      user: new Types.ObjectId(userId),
    });

    const seller = await this.create(
      sellerEntity as unknown as CreateSellerDto,
    );

    this.logOperation('createSellerProfile', 'completed', {
      sellerId: seller._id,
      userId,
    });

    return seller;
  }

  /**
   * Find seller by user ID
   */
  @HandleErrors('find by user id', 'sellers')
  findByUserId(userId: string): Promise<Seller | null> {
    return this.model
      .findOne({
        isDeleted: false,
        user: new Types.ObjectId(userId),
      })
      .exec();
  }

  /**
   * Find seller by slug
   */
  @HandleErrors('find by slug', 'sellers')
  findBySlug(slug: string): Promise<Seller | null> {
    return this.model
      .findOne({
        isDeleted: false,
        slug,
      })
      .exec();
  }

  /**
   * Update seller badge tier based on total sales
   */
  @HandleErrors('update badge tier', 'sellers')
  async updateBadgeTier(sellerId: string): Promise<Seller | null> {
    const seller = await this.model.findById(sellerId).exec();
    if (!seller) {
      return null;
    }

    let newBadgeTier = SellerBadgeTier.NEW;

    if (seller.totalSales >= 100) {
      newBadgeTier = SellerBadgeTier.TOP_SELLER;
    } else if (seller.totalSales >= 10) {
      newBadgeTier = SellerBadgeTier.VERIFIED;
    }

    if (seller.badgeTier !== newBadgeTier) {
      return this.patch(sellerId, { badgeTier: newBadgeTier });
    }

    return seller;
  }

  /**
   * Update seller statistics
   */
  @HandleErrors('update seller stats', 'sellers')
  async updateSellerStats(
    sellerId: string,
    updates: {
      totalEarnings?: number;
      totalSales?: number;
      rating?: number;
      reviewCount?: number;
      followerCount?: number;
    },
  ): Promise<Seller | null> {
    this.logOperation('updateSellerStats', 'started', { sellerId, updates });

    const updateOperations: Record<string, number> = {};

    if (updates.totalEarnings !== undefined) {
      updateOperations.totalEarnings = updates.totalEarnings;
    }
    if (updates.totalSales !== undefined) {
      updateOperations.totalSales = updates.totalSales;
    }
    if (updates.rating !== undefined) {
      updateOperations.rating = updates.rating;
    }
    if (updates.reviewCount !== undefined) {
      updateOperations.reviewCount = updates.reviewCount;
    }
    if (updates.followerCount !== undefined) {
      updateOperations.followerCount = updates.followerCount;
    }

    const result = await this.model
      .findByIdAndUpdate(
        sellerId,
        { $inc: updateOperations },
        { returnDocument: 'after' },
      )
      .exec();

    this.logOperation('updateSellerStats', 'completed', { sellerId });

    return result;
  }

  /**
   * Increment specific stats atomically
   */
  @HandleErrors('increment seller stats', 'sellers')
  incrementSellerStats(
    sellerId: string,
    increments: {
      totalEarnings?: number;
      totalSales?: number;
      reviewCount?: number;
      followerCount?: number;
    },
  ): Promise<Seller | null> {
    return this.model
      .findByIdAndUpdate(
        sellerId,
        { $inc: increments },
        { returnDocument: 'after' },
      )
      .exec();
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  @HandleErrors('get admin sellers', 'sellers')
  async getAdminSellers(
    organizationId: string,
    query: AdminSellerQueryDto,
  ): Promise<AggregatePaginateResult<Seller>> {
    this.logOperation('getAdminSellers', 'started', {
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
      ...(sanitizedSearch
        ? [
            {
              $match: {
                $or: [
                  { displayName: { $options: 'i', $regex: sanitizedSearch } },
                  { slug: { $options: 'i', $regex: sanitizedSearch } },
                ],
              },
            },
          ]
        : []),
      { $sort: handleQuerySort(query.sort) },
    ];

    const result = await this.findAll(aggregate, options);

    this.logOperation('getAdminSellers', 'completed', {
      count: result.data?.length ?? 0,
      organizationId,
    });

    return result;
  }

  @HandleErrors('get admin seller by id', 'sellers')
  async getAdminSellerById(
    organizationId: string,
    sellerId: string,
  ): Promise<Seller | null> {
    this.logOperation('getAdminSellerById', 'started', {
      organizationId,
      sellerId,
    });

    const seller = await this.model
      .findOne({
        _id: sellerId,
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      })
      .exec();

    this.logOperation('getAdminSellerById', 'completed', {
      found: Boolean(seller),
      organizationId,
      sellerId,
    });

    return seller;
  }

  @HandleErrors('set seller status', 'sellers')
  async setSellerStatus(
    organizationId: string,
    sellerId: string,
    status: SellerStatus,
  ): Promise<Seller> {
    const seller = await this.getAdminSellerById(organizationId, sellerId);

    if (!seller) {
      throw new BadRequestException('Seller not found');
    }

    return this.patch(sellerId, { status });
  }

  @HandleErrors('get admin payouts', 'sellers')
  async getAdminPayouts(
    organizationId: string,
    query: AdminSellerQueryDto,
  ): Promise<AggregatePaginateResult<Seller>> {
    this.logOperation('getAdminPayouts', 'started', {
      organizationId,
      query,
    });

    const payoutQuery: AdminSellerQueryDto = {
      ...query,
      sort: query.sort || 'totalEarnings: -1',
    };

    const result = await this.getAdminSellers(organizationId, payoutQuery);

    this.logOperation('getAdminPayouts', 'completed', {
      count: result.data?.length ?? 0,
      organizationId,
    });

    return result;
  }
}
