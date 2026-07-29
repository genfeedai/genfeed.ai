import { ITEMS_PER_PAGE } from '@genfeedai/constants';
import { PageScope, type PostStatus } from '@genfeedai/enums';
import type {
  IPaginatedResponse,
  IPost,
  IQueryParams,
} from '@genfeedai/interfaces';
import type { PostsService } from '@services/content/posts.service';
import { logger } from '@services/core/logger.service';
import type { OrganizationsService } from '@services/organization/organizations.service';
import type { BrandsService } from '@services/social/brands.service';

export type FetchPostsParams = {
  scope: PageScope | undefined;
  brandId: string | undefined;
  organizationId: string | undefined;
  platformFilter: string | undefined;
  filterStatus: string;
  filterSearch: string;
  filterSort: string | undefined;
  currentPage: number;
  publicationState?: 'posted' | 'not-posted';
  status: PostStatus | undefined;
  adminOrg: string;
  adminBrand: string;
  getBrandsService: () => Promise<BrandsService>;
  getOrganizationsService: () => Promise<OrganizationsService>;
  getPostsService: () => Promise<PostsService>;
};

export interface PostsListResult {
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  posts: IPost[];
}

function toPostsListResult(result: IPaginatedResponse<IPost>): PostsListResult {
  return {
    pagination: {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: result.totalPages,
    },
    posts: result.items,
  };
}

export async function fetchPosts({
  scope,
  brandId,
  organizationId,
  platformFilter,
  filterStatus,
  filterSearch,
  filterSort,
  currentPage,
  publicationState,
  status,
  adminOrg,
  adminBrand,
  getBrandsService,
  getOrganizationsService,
  getPostsService,
}: FetchPostsParams): Promise<PostsListResult> {
  let url = 'GET /posts';

  const query: IQueryParams & {
    platform?: string;
    status?: string;
    search?: string;
    sort?: string;
    publicationState?: string;
  } = {
    limit: ITEMS_PER_PAGE,
    page: currentPage,
  };

  if (platformFilter) {
    query.platform = platformFilter;
  }

  if (publicationState) {
    query.publicationState = publicationState;
  } else if (filterStatus) {
    query.status = filterStatus;
  } else if (status) {
    query.status = status;
  }

  // Add search filter
  if (filterSearch) {
    query.search = filterSearch;
  }

  // Add sort filter
  if (filterSort) {
    query.sort = filterSort;
  }

  let data: IPaginatedResponse<IPost> = {
    hasNext: false,
    hasPrevious: currentPage > 1,
    items: [],
    page: currentPage,
    pageSize: ITEMS_PER_PAGE,
    total: 0,
    totalPages: 1,
  };

  // Load posts based on scope
  if ((scope === PageScope.BRAND || scope === PageScope.PUBLISHER) && brandId) {
    const service = await getBrandsService();
    url = `GET /brands/${brandId}/posts`;
    data = await service.findBrandPostsPage(brandId, query);
  } else if (scope === PageScope.ORGANIZATION && organizationId) {
    const service = await getOrganizationsService();
    url = `GET /organizations/${organizationId}/posts`;
    data = await service.findOrganizationPostsPage(organizationId, query);
  } else if (scope === PageScope.SUPERADMIN) {
    const service = await getPostsService();
    url = 'GET /posts';
    if (adminOrg) {
      query.organization = adminOrg;
    }
    if (adminBrand) {
      query.brand = adminBrand;
    }
    data = await service.findAllPage(query);
  } else if (!scope && organizationId) {
    // Default to organization scope
    const service = await getOrganizationsService();
    url = `GET /organizations/${organizationId}/posts`;
    data = await service.findOrganizationPostsPage(organizationId, query);
  } else {
    // Fallback to global (will likely require superadmin)
    const service = await getPostsService();
    data = await service.findAllPage(query);
  }

  logger.info(`${url} success`, {
    itemCount: data.items.length,
    page: data.page,
    total: data.total,
    totalPages: data.totalPages,
  });
  return toPostsListResult(data);
}
