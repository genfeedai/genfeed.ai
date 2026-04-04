import type { IListing, IPurchase, ISeller } from '@cloud/interfaces';
import type {
  ListingStatus,
  ListingType,
  SellerStatus,
} from '@genfeedai/enums';
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@helpers/data/json-api/json-api.helper';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';

export interface MarketplaceAnalyticsOverview {
  totalRevenue: number;
  totalSales: number;
  totalPlatformFees: number;
  totalSellerEarnings: number;
  completedOrders: number;
  pendingOrders: number;
  failedOrders: number;
  recentSales: Array<{ date: string; count: number; revenue: number }>;
}

interface PaginationMeta {
  page: number;
  pages: number;
  total?: number;
}

export interface AdminListingsQuery {
  page?: number;
  limit?: number;
  sort?: string;
  status?: ListingStatus;
  type?: ListingType;
  search?: string;
}

export interface AdminSellersQuery {
  page?: number;
  limit?: number;
  sort?: string;
  status?: SellerStatus;
  search?: string;
}

export interface AdminPurchasesQuery {
  page?: number;
  limit?: number;
  sort?: string;
  status?: string;
  search?: string;
}

export class AdminMarketplaceService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/admin/marketplace`, token);
  }

  public static getInstance(token: string): AdminMarketplaceService {
    return HTTPBaseService.getBaseServiceInstance(
      AdminMarketplaceService,
      token,
    ) as AdminMarketplaceService;
  }

  async getListings(query: AdminListingsQuery = {}): Promise<{
    listings: IListing[];
    pagination?: PaginationMeta;
  }> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      '/listings',
      { params: query },
    );

    return {
      listings: deserializeCollection<IListing>(response.data),
      pagination: response.data.links?.pagination as PaginationMeta | undefined,
    };
  }

  async getListing(listingId: string): Promise<IListing | null> {
    try {
      const response = await this.instance.get<JsonApiResponseDocument>(
        `/listings/${listingId}`,
      );
      return deserializeResource<IListing>(response.data);
    } catch {
      return null;
    }
  }

  async approveListing(listingId: string, reason?: string): Promise<IListing> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      `/listings/${listingId}/approve`,
      { reason },
    );

    return deserializeResource<IListing>(response.data);
  }

  async rejectListing(listingId: string, reason: string): Promise<IListing> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      `/listings/${listingId}/reject`,
      { reason },
    );

    return deserializeResource<IListing>(response.data);
  }

  async getSellers(query: AdminSellersQuery = {}): Promise<{
    sellers: ISeller[];
    pagination?: PaginationMeta;
  }> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      '/sellers',
      { params: query },
    );

    return {
      pagination: response.data.links?.pagination as PaginationMeta | undefined,
      sellers: deserializeCollection<ISeller>(response.data),
    };
  }

  async getSeller(sellerId: string): Promise<ISeller | null> {
    try {
      const response = await this.instance.get<JsonApiResponseDocument>(
        `/sellers/${sellerId}`,
      );
      return deserializeResource<ISeller>(response.data);
    } catch {
      return null;
    }
  }

  async updateSellerStatus(
    sellerId: string,
    status: SellerStatus,
  ): Promise<ISeller> {
    const response = await this.instance.patch<JsonApiResponseDocument>(
      `/sellers/${sellerId}/status`,
      { status },
    );

    return deserializeResource<ISeller>(response.data);
  }

  async getPurchases(query: AdminPurchasesQuery = {}): Promise<{
    purchases: IPurchase[];
    pagination?: PaginationMeta;
  }> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      '/purchases',
      { params: query },
    );

    return {
      pagination: response.data.links?.pagination as PaginationMeta | undefined,
      purchases: deserializeCollection<IPurchase>(response.data),
    };
  }

  async getPurchase(purchaseId: string): Promise<IPurchase | null> {
    try {
      const response = await this.instance.get<JsonApiResponseDocument>(
        `/purchases/${purchaseId}`,
      );
      return deserializeResource<IPurchase>(response.data);
    } catch {
      return null;
    }
  }

  async getPayouts(query: AdminSellersQuery = {}): Promise<{
    payouts: ISeller[];
    pagination?: PaginationMeta;
  }> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      '/payouts',
      { params: query },
    );

    return {
      pagination: response.data.links?.pagination as PaginationMeta | undefined,
      payouts: deserializeCollection<ISeller>(response.data),
    };
  }

  async getAnalyticsOverview(
    days: number = 30,
  ): Promise<MarketplaceAnalyticsOverview> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      '/analytics/overview',
      {
        params: { days },
      },
    );

    return deserializeResource<MarketplaceAnalyticsOverview>(response.data);
  }
}
