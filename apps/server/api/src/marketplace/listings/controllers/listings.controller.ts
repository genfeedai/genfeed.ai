import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { CreateListingDto } from '@api/marketplace/listings/dto/create-listing.dto';
import { ListingQueryDto } from '@api/marketplace/listings/dto/listing-query.dto';
import { ReviewListingDto } from '@api/marketplace/listings/dto/review-listing.dto';
import { UpdateListingDto } from '@api/marketplace/listings/dto/update-listing.dto';
import { ListingsService } from '@api/marketplace/listings/services/listings.service';
import { PurchasesService } from '@api/marketplace/purchases/services/purchases.service';
import { SellersService } from '@api/marketplace/sellers/services/sellers.service';
import type { User } from '@clerk/backend';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
import { ListingSerializer, PurchaseSerializer } from '@genfeedai/serializers';
import { Public } from '@libs/decorators/public.decorator';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@ApiTags('Marketplace Listings')
@Public()
@Controller('marketplace/listings')
export class ListingsController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly listingsService: ListingsService,
    private readonly purchasesService: PurchasesService,
    readonly _sellersService: SellersService,
  ) {}

  /**
   * Browse public published listings
   */
  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async browseListings(
    @Req() request: Request,
    @Query() query: ListingQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const data = await this.listingsService.getPublicListings(query);
    return serializeCollection(request, ListingSerializer, data);
  }

  /**
   * Check if user owns a listing (requires auth)
   * NOTE: Must be declared before :sellerSlug/:listingSlug to avoid route shadowing
   * @deprecated Use `GET /marketplace/listings/:listingId/ownership` on PurchasesController instead.
   * This endpoint will be removed in a future release.
   */
  @Get(':listingId/owned')
  @ApiBearerAuth()
  @ApiOperation({
    deprecated: true,
    summary:
      'Deprecated: Use GET /marketplace/listings/:listingId/ownership instead',
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async checkOwnership(
    @Param('listingId') listingId: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);

    const { owned, purchase } =
      await this.purchasesService.checkListingOwnership(
        listingId,
        publicMetadata.user,
        publicMetadata.organization,
      );

    return {
      data: {
        attributes: {
          listingId,
          owned,
          purchaseId: purchase?._id?.toString(),
          userId: publicMetadata.user,
        },
        id: listingId,
        type: 'listing-ownership',
      },
    };
  }

  /**
   * Get public listing by seller slug and listing slug
   */
  @Get(':sellerSlug/:listingSlug')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getListingBySlug(
    @Req() request: Request,
    @Param('sellerSlug') sellerSlug: string,
    @Param('listingSlug') listingSlug: string,
  ): Promise<JsonApiSingleResponse> {
    const fullSlug = `${sellerSlug}/${listingSlug}`;
    const listing = await this.listingsService.findBySlug(fullSlug);

    if (!listing) {
      return returnNotFound(this.constructorName, fullSlug);
    }

    // Increment view count
    await this.listingsService.incrementViews(listing._id.toString());

    return serializeSingle(request, ListingSerializer, listing);
  }

  /**
   * Get preview data for a listing (public)
   */
  @Get(':sellerSlug/:listingSlug/preview')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getListingPreview(
    @Param('sellerSlug') sellerSlug: string,
    @Param('listingSlug') listingSlug: string,
  ): Promise<JsonApiSingleResponse> {
    const fullSlug = `${sellerSlug}/${listingSlug}`;
    const listing = await this.listingsService.findBySlug(fullSlug);

    if (!listing) {
      return returnNotFound(this.constructorName, fullSlug);
    }

    return {
      data: {
        attributes: {
          previewData: listing.previewData,
          title: listing.title,
          type: listing.type,
        },
        id: listing._id.toString(),
        type: 'listing-preview',
      },
    };
  }

  /**
   * Get featured listings (official, highest rated)
   */
  @Get('featured')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getFeatured(
    @Req() request: Request,
  ): Promise<JsonApiCollectionResponse> {
    const data = await this.listingsService.getFeaturedListings(12);
    return serializeCollection(request, ListingSerializer, data);
  }

  /**
   * Get category counts for published listings
   */
  @Get('categories')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getCategories(): Promise<JsonApiSingleResponse> {
    const categories = await this.listingsService.getCategoryCounts();

    return {
      data: {
        attributes: { categories },
        id: 'categories',
        type: 'category-counts',
      },
    };
  }

  /**
   * Get user's library (claimed/purchased items)
   */
  @Get('library')
  @ApiBearerAuth()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getLibrary(
    @Req() request: Request,
    @Query() query: ListingQueryDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiCollectionResponse> {
    const publicMetadata = getPublicMetadata(user);

    const data = await this.purchasesService.getBuyerPurchases(
      publicMetadata.user,
      publicMetadata.organization,
      // @ts-expect-error TS2345
      query,
    );

    return serializeCollection(request, PurchaseSerializer, data);
  }

  /**
   * Claim a free listing to library
   */
  @Post('library/:listingId')
  @ApiBearerAuth()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async addToLibrary(
    @Req() request: Request,
    @Param('listingId') listingId: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);

    const purchase = await this.purchasesService.claimFreeItem(
      listingId,
      publicMetadata.user,
      publicMetadata.organization,
    );

    return serializeSingle(request, PurchaseSerializer, purchase);
  }
}

/**
 * Seller-specific listing management
 */
@AutoSwagger()
@ApiTags('Seller Listings')
@Controller('seller/listings')
@ApiBearerAuth()
export class SellerListingsController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly listingsService: ListingsService,
    private readonly sellersService: SellersService,
  ) {}

  /**
   * Get current seller's listings
   */
  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getMyListings(
    @Req() request: Request,
    @Query() query: ListingQueryDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiCollectionResponse> {
    const publicMetadata = getPublicMetadata(user);

    const seller = await this.sellersService.findByUserId(publicMetadata.user);

    if (!seller) {
      return {
        data: [],
        meta: {
          hasNextPage: false,
          hasPrevPage: false,
          limit: 10,
          page: 1,
          totalDocs: 0,
          totalPages: 0,
        },
      };
    }

    const data = await this.listingsService.getSellerListings(
      seller._id.toString(),
      query,
    );

    return serializeCollection(request, ListingSerializer, data);
  }

  /**
   * Create a new listing
   */
  @Post()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async createListing(
    @Req() request: Request,
    @Body() createListingDto: CreateListingDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);

    const seller = await this.sellersService.findByUserId(publicMetadata.user);

    if (!seller) {
      return returnNotFound('Seller', publicMetadata.user);
    }

    const listing = await this.listingsService.createListing(
      seller._id.toString(),
      publicMetadata.organization,
      createListingDto,
    );

    return serializeSingle(request, ListingSerializer, listing);
  }

  /**
   * Get a specific listing
   */
  @Get(':listingId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getListing(
    @Req() request: Request,
    @Param('listingId') listingId: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);

    const seller = await this.sellersService.findByUserId(publicMetadata.user);

    if (!seller) {
      return returnNotFound('Seller', publicMetadata.user);
    }

    const listing = await this.listingsService.findOne({
      _id: listingId,
      isDeleted: false,
      seller: seller._id,
    });

    if (!listing) {
      return returnNotFound(this.constructorName, listingId);
    }

    return serializeSingle(request, ListingSerializer, listing);
  }

  /**
   * Update a listing
   */
  @Put(':listingId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async updateListing(
    @Req() request: Request,
    @Param('listingId') listingId: string,
    @Body() updateListingDto: UpdateListingDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);

    const seller = await this.sellersService.findByUserId(publicMetadata.user);

    if (!seller) {
      return returnNotFound('Seller', publicMetadata.user);
    }

    const listing = await this.listingsService.findOne({
      _id: listingId,
      isDeleted: false,
      seller: seller._id,
    });

    if (!listing) {
      return returnNotFound(this.constructorName, listingId);
    }

    const updated = await this.listingsService.patch(
      listingId,
      updateListingDto,
    );

    return serializeSingle(request, ListingSerializer, updated);
  }

  /**
   * Archive a listing
   */
  @Delete(':listingId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async archiveListing(
    @Param('listingId') listingId: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse<{ message: string }>> {
    const publicMetadata = getPublicMetadata(user);

    const seller = await this.sellersService.findByUserId(publicMetadata.user);

    if (!seller) {
      return returnNotFound('Seller', publicMetadata.user);
    }

    await this.listingsService.archiveListing(listingId, seller._id.toString());

    return {
      data: {
        attributes: {
          message: 'Listing archived successfully',
        },
        id: listingId,
        type: 'listing',
      },
    };
  }

  /**
   * Submit listing for review
   */
  @Post(':listingId/submit')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async submitForReview(
    @Req() request: Request,
    @Param('listingId') listingId: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);

    const seller = await this.sellersService.findByUserId(publicMetadata.user);

    if (!seller) {
      return returnNotFound('Seller', publicMetadata.user);
    }

    const listing = await this.listingsService.submitForReview(
      listingId,
      seller._id.toString(),
    );

    return serializeSingle(request, ListingSerializer, listing);
  }
}

@AutoSwagger()
@ApiTags('Admin Marketplace Listings')
@Controller('admin/marketplace/listings')
@UseGuards(RolesGuard)
@ApiBearerAuth()
export class AdminListingsController {
  constructor(private readonly listingsService: ListingsService) {}

  @Get()
  @RolesDecorator('superadmin')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getListings(
    @Req() request: Request,
    @Query() query: ListingQueryDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiCollectionResponse> {
    const publicMetadata = getPublicMetadata(user);
    const data = await this.listingsService.getAdminListings(
      publicMetadata.organization,
      query,
    );

    return serializeCollection(request, ListingSerializer, data);
  }

  @Get(':listingId')
  @RolesDecorator('superadmin')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getListing(
    @Req() request: Request,
    @Param('listingId') listingId: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);
    const listing = await this.listingsService.getAdminListingById(
      publicMetadata.organization,
      listingId,
    );

    if (!listing) {
      return returnNotFound('AdminListingsController', listingId);
    }

    return serializeSingle(request, ListingSerializer, listing);
  }

  @Post(':listingId/approve')
  @RolesDecorator('superadmin')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async approveListing(
    @Req() request: Request,
    @Param('listingId') listingId: string,
    @Body() body: ReviewListingDto,
  ): Promise<JsonApiSingleResponse> {
    const listing = await this.listingsService.reviewListing(
      listingId,
      true,
      body.reason,
    );

    return serializeSingle(request, ListingSerializer, listing);
  }

  @Post(':listingId/reject')
  @RolesDecorator('superadmin')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async rejectListing(
    @Req() request: Request,
    @Param('listingId') listingId: string,
    @Body() body: ReviewListingDto,
  ): Promise<JsonApiSingleResponse> {
    const listing = await this.listingsService.reviewListing(
      listingId,
      false,
      body.reason,
    );

    return serializeSingle(request, ListingSerializer, listing);
  }
}
