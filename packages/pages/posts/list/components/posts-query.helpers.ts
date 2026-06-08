import { ITEMS_PER_PAGE } from '@genfeedai/constants';
import { PageScope, PostStatus } from '@genfeedai/enums';
import type { IPost, IQueryParams } from '@genfeedai/interfaces';
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
  status: PostStatus | undefined;
  adminOrg: string;
  adminBrand: string;
  getBrandsService: () => Promise<BrandsService>;
  getOrganizationsService: () => Promise<OrganizationsService>;
  getPostsService: () => Promise<PostsService>;
};

export async function fetchPosts({
  scope,
  brandId,
  organizationId,
  platformFilter,
  filterStatus,
  filterSearch,
  filterSort,
  currentPage,
  status,
  adminOrg,
  adminBrand,
  getBrandsService,
  getOrganizationsService,
  getPostsService,
}: FetchPostsParams): Promise<IPost[]> {
  let url = 'GET /posts';

  const query: IQueryParams & {
    platform?: string;
    status?: string;
    search?: string;
    sort?: string;
  } = {
    limit: ITEMS_PER_PAGE,
    page: currentPage,
  };

  if (platformFilter) {
    query.platform = platformFilter;
  }

  // Add status filter from filters state
  // For publisher app (PUBLISHER scope), exclude PUBLIC by default if no status filter is set
  if (scope === PageScope.PUBLISHER && !filterStatus && !status) {
    // Exclude PUBLIC status - we'll filter client-side after fetching
  } else if (filterStatus) {
    query.status = filterStatus;
  } else if (status) {
    // If status prop is provided (analytics app), use it
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

  let data: IPost[] = [];

  // Load posts based on scope
  if ((scope === PageScope.BRAND || scope === PageScope.PUBLISHER) && brandId) {
    const service = await getBrandsService();
    url = `GET /brands/${brandId}/posts`;
    data = await service.findBrandPosts(brandId, query);
  } else if (scope === PageScope.ORGANIZATION && organizationId) {
    const service = await getOrganizationsService();
    url = `GET /organizations/${organizationId}/posts`;
    data = await service.findOrganizationPosts(organizationId, query);
  } else if (scope === PageScope.SUPERADMIN) {
    const service = await getPostsService();
    url = 'GET /posts';
    if (adminOrg) {
      query.organization = adminOrg;
    }
    if (adminBrand) {
      query.brand = adminBrand;
    }
    data = await service.findAll(query);
  } else if (!scope && organizationId) {
    // Default to organization scope
    const service = await getOrganizationsService();
    url = `GET /organizations/${organizationId}/posts`;
    data = await service.findOrganizationPosts(organizationId, query);
  } else {
    // Fallback to global (will likely require superadmin)
    const service = await getPostsService();
    data = await service.findAll(query);
  }

  logger.info(`${url} success`, data);

  // For publisher app (PUBLISHER scope), exclude PUBLIC posts by default if no status filter is set
  if (scope === PageScope.PUBLISHER && !filterStatus && !status) {
    return data.filter((post) => post.status !== PostStatus.PUBLIC);
  }

  return data;
}
