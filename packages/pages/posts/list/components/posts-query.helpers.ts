import {
  PageScope,
  type PostStatus,
  type PostVisibility,
  type TargetExecutionState,
} from '@genfeedai/contracts';
import { mapPostStatusToCanonicalWrite } from '@genfeedai/contracts/api-types/contracts/scheduler.contract';
import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import type {
  IPaginatedResponse,
  IPost,
  IQueryParams,
} from '@genfeedai/contracts/interfaces';
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

export function mapPostsListStatusFilter(
  status: string | PostStatus | undefined,
): {
  executionState?: TargetExecutionState;
  visibility?: PostVisibility;
} {
  const write = mapPostStatusToCanonicalWrite(status);
  if (!write.targetExecutionState) {
    return {};
  }

  return {
    executionState: write.targetExecutionState,
    ...(write.visibility !== undefined ? { visibility: write.visibility } : {}),
  };
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
    executionState?: TargetExecutionState;
    platform?: string;
    publicationState?: string;
    search?: string;
    sort?: string;
    visibility?: PostVisibility;
  } = {
    limit: ITEMS_PER_PAGE,
    page: currentPage,
  };

  if (platformFilter) {
    query.platform = platformFilter;
  }

  if (publicationState) {
    query.publicationState = publicationState;
  } else {
    Object.assign(query, mapPostsListStatusFilter(filterStatus || status));
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

  // Load posts based on scope (collection endpoints with brand/org query filters)
  if (
    (scope === PageScope.BRAND || scope === PageScope.PUBLISHING) &&
    brandId
  ) {
    const service = await getBrandsService();
    url = `GET /posts?brandId=${brandId}`;
    data = await service.findBrandPostsPage(brandId, query);
  } else if (scope === PageScope.ORGANIZATION && organizationId) {
    const service = await getOrganizationsService();
    url = `GET /posts?organizationId=${organizationId}`;
    data = await service.findOrganizationPostsPage(organizationId, query);
  } else if (scope === PageScope.SUPERADMIN) {
    const service = await getPostsService();
    url = 'GET /posts';
    if (adminOrg) {
      query.organizationId = adminOrg;
    }
    if (adminBrand) {
      query.brandId = adminBrand;
    }
    data = await service.findAllPage(query);
  } else if (!scope && organizationId) {
    // Default to organization scope
    const service = await getOrganizationsService();
    url = `GET /posts?organizationId=${organizationId}`;
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
