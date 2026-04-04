import {
  ListingsController,
  SellerListingsController,
} from '@api/marketplace/listings/controllers/listings.controller';
import { ListingsService } from '@api/marketplace/listings/services/listings.service';
import { PurchasesService } from '@api/marketplace/purchases/services/purchases.service';
import { SellersService } from '@api/marketplace/sellers/services/sellers.service';
import type { User } from '@clerk/backend';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

vi.mock('@api/helpers/utils/clerk/clerk.util', () => ({
  getPublicMetadata: vi.fn(() => ({
    organization: new Types.ObjectId().toString(),
    user: new Types.ObjectId().toString(),
  })),
}));

vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnNotFound: vi.fn((type: string, id: string) => ({
    data: {
      attributes: { message: `${type} ${id} not found` },
      id,
      type: 'not-found',
    },
  })),
  serializeCollection: vi.fn((_req: unknown, _s: unknown, data: unknown) => ({
    data,
  })),
  serializeSingle: vi.fn((_req: unknown, _s: unknown, data: unknown) => ({
    data,
  })),
}));

import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';

describe('ListingsController', () => {
  let controller: ListingsController;
  let listingsService: vi.Mocked<ListingsService>;
  let purchasesService: vi.Mocked<PurchasesService>;

  const mockUser = {} as User;
  const mockRequest = { headers: {}, url: '/marketplace/listings' } as never;

  const mockListing = {
    _id: new Types.ObjectId(),
    previewData: { foo: 'bar' },
    title: 'Test Listing',
    type: 'workflow',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ListingsController],
      providers: [
        {
          provide: ListingsService,
          useValue: {
            findBySlug: vi.fn(),
            getCategoryCounts: vi.fn(),
            getFeaturedListings: vi.fn(),
            getPublicListings: vi.fn(),
            incrementViews: vi.fn(),
          },
        },
        {
          provide: PurchasesService,
          useValue: {
            checkListingOwnership: vi.fn(),
            claimFreeItem: vi.fn(),
            getBuyerPurchases: vi.fn(),
          },
        },
        {
          provide: SellersService,
          useValue: { findByUserId: vi.fn() },
        },
      ],
    }).compile();

    controller = module.get<ListingsController>(ListingsController);
    listingsService = module.get(ListingsService);
    purchasesService = module.get(PurchasesService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('browseListings', () => {
    it('should return serialized public listings', async () => {
      const mockListings = [mockListing];
      listingsService.getPublicListings.mockResolvedValue(
        mockListings as never,
      );

      const result = await controller.browseListings(mockRequest, {} as never);

      expect(listingsService.getPublicListings).toHaveBeenCalledWith({});
      expect(serializeCollection).toHaveBeenCalled();
      expect(result).toEqual({ data: mockListings });
    });
  });

  describe('getListingBySlug', () => {
    it('should return listing and increment views', async () => {
      listingsService.findBySlug.mockResolvedValue(mockListing as never);
      listingsService.incrementViews.mockResolvedValue(undefined as never);

      const result = await controller.getListingBySlug(
        mockRequest,
        'seller-slug',
        'listing-slug',
      );

      expect(listingsService.findBySlug).toHaveBeenCalledWith(
        'seller-slug/listing-slug',
      );
      expect(listingsService.incrementViews).toHaveBeenCalledWith(
        mockListing._id.toString(),
      );
      expect(serializeSingle).toHaveBeenCalled();
    });

    it('should return not-found when listing does not exist', async () => {
      listingsService.findBySlug.mockResolvedValue(null);

      const result = await controller.getListingBySlug(
        mockRequest,
        'no-seller',
        'no-listing',
      );

      expect(returnNotFound).toHaveBeenCalled();
      expect(listingsService.incrementViews).not.toHaveBeenCalled();
    });
  });

  describe('getListingPreview', () => {
    it('should return preview data for a valid listing', async () => {
      listingsService.findBySlug.mockResolvedValue(mockListing as never);

      const result = await controller.getListingPreview('seller', 'listing');

      expect(result.data).toMatchObject({
        attributes: expect.objectContaining({
          previewData: { foo: 'bar' },
          title: 'Test Listing',
        }),
        type: 'listing-preview',
      });
    });

    it('should return not-found for invalid slug', async () => {
      listingsService.findBySlug.mockResolvedValue(null);

      const result = await controller.getListingPreview('bad', 'slug');

      expect(returnNotFound).toHaveBeenCalled();
    });
  });

  describe('getFeatured', () => {
    it('should return featured listings', async () => {
      const featured = [mockListing];
      listingsService.getFeaturedListings.mockResolvedValue(featured as never);

      const result = await controller.getFeatured(mockRequest);

      expect(listingsService.getFeaturedListings).toHaveBeenCalledWith(12);
      expect(result).toEqual({ data: featured });
    });
  });

  describe('getCategories', () => {
    it('should return category counts', async () => {
      const categories = { image: 5, video: 10 };
      listingsService.getCategoryCounts.mockResolvedValue(categories as never);

      const result = await controller.getCategories();

      expect(result.data).toMatchObject({
        attributes: { categories },
        id: 'categories',
        type: 'category-counts',
      });
    });
  });

  describe('checkOwnership', () => {
    it('should return ownership status when user owns listing', async () => {
      purchasesService.checkListingOwnership.mockResolvedValue({
        owned: true,
        purchase: { _id: new Types.ObjectId() },
      } as never);

      const result = await controller.checkOwnership('listing-id', mockUser);

      expect(result.data).toMatchObject({
        attributes: expect.objectContaining({ owned: true }),
        id: 'listing-id',
        type: 'listing-ownership',
      });
    });

    it('should return ownership as false when user does not own', async () => {
      purchasesService.checkListingOwnership.mockResolvedValue({
        owned: false,
        purchase: null,
      } as never);

      const result = await controller.checkOwnership('listing-id-2', mockUser);

      expect(result.data.attributes).toMatchObject({ owned: false });
    });
  });
});

describe('SellerListingsController', () => {
  let controller: SellerListingsController;
  let listingsService: vi.Mocked<ListingsService>;
  let sellersService: vi.Mocked<SellersService>;

  const mockUser = {} as User;
  const mockRequest = { headers: {} } as never;
  const mockSeller = { _id: new Types.ObjectId() };
  const mockListing = { _id: new Types.ObjectId(), title: 'My Listing' };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SellerListingsController],
      providers: [
        {
          provide: ListingsService,
          useValue: {
            archiveListing: vi.fn(),
            createListing: vi.fn(),
            findOne: vi.fn(),
            getSellerListings: vi.fn(),
            patch: vi.fn(),
            submitForReview: vi.fn(),
          },
        },
        {
          provide: SellersService,
          useValue: { findByUserId: vi.fn() },
        },
      ],
    }).compile();

    controller = module.get<SellerListingsController>(SellerListingsController);
    listingsService = module.get(ListingsService);
    sellersService = module.get(SellersService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getMyListings', () => {
    it('should return empty collection when seller does not exist', async () => {
      sellersService.findByUserId.mockResolvedValue(null);

      const result = await controller.getMyListings(
        mockRequest,
        {} as never,
        mockUser,
      );

      expect(result.data).toEqual([]);
      expect(listingsService.getSellerListings).not.toHaveBeenCalled();
    });

    it('should return seller listings when seller exists', async () => {
      sellersService.findByUserId.mockResolvedValue(mockSeller as never);
      listingsService.getSellerListings.mockResolvedValue([
        mockListing,
      ] as never);

      const result = await controller.getMyListings(
        mockRequest,
        {} as never,
        mockUser,
      );

      expect(listingsService.getSellerListings).toHaveBeenCalled();
      expect(serializeCollection).toHaveBeenCalled();
    });
  });

  describe('createListing', () => {
    it('should return not-found when seller does not exist', async () => {
      sellersService.findByUserId.mockResolvedValue(null);

      await controller.createListing(mockRequest, {} as never, mockUser);

      expect(returnNotFound).toHaveBeenCalled();
      expect(listingsService.createListing).not.toHaveBeenCalled();
    });

    it('should create listing when seller exists', async () => {
      sellersService.findByUserId.mockResolvedValue(mockSeller as never);
      listingsService.createListing.mockResolvedValue(mockListing as never);

      const result = await controller.createListing(
        mockRequest,
        { title: 'New Listing' } as never,
        mockUser,
      );

      expect(listingsService.createListing).toHaveBeenCalled();
      expect(serializeSingle).toHaveBeenCalled();
    });
  });

  describe('archiveListing', () => {
    it('should archive listing and return success message', async () => {
      sellersService.findByUserId.mockResolvedValue(mockSeller as never);
      listingsService.archiveListing.mockResolvedValue(undefined as never);

      const result = await controller.archiveListing('listing-id', mockUser);

      expect(listingsService.archiveListing).toHaveBeenCalledWith(
        'listing-id',
        mockSeller._id.toString(),
      );
      expect(result.data.attributes).toMatchObject({
        message: 'Listing archived successfully',
      });
    });
  });
});
