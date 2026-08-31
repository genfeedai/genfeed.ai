import 'server-only';

import {
  getServerAuthToken,
  hasUsableServerAuthToken,
  loadProtectedBootstrap,
} from '@app-server/protected-bootstrap.server';
import { ITEMS_PER_PAGE } from '@genfeedai/constants';
import { ModelCategory, PageScope, type PostStatus } from '@genfeedai/enums';
import type {
  IPaginatedResponse,
  IPost,
  IPreset,
  IQueryParams,
} from '@genfeedai/interfaces';
import { mapPostsListStatusFilter } from '@pages/posts/list/components/posts-query.helpers';
import { logger } from '@services/core/logger.service';
import { PresetsService } from '@services/elements/presets.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import { BrandsService } from '@services/social/brands.service';
import { cache } from 'react';

export interface PostsPageData {
  brandId: string | null;
  organizationId: string | null;
  postPresets: IPreset[];
  posts: IPost[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface LoadPostsPageDataOptions {
  currentPage: number;
  platformFilter?: string;
  scope: PageScope;
  publicationState?: 'posted' | 'not-posted';
  search?: string;
  sort?: string;
  status?: PostStatus;
}

export const loadPostsPageData = cache(
  async ({
    currentPage,
    platformFilter,
    scope,
    publicationState,
    search,
    sort,
    status,
  }: LoadPostsPageDataOptions): Promise<PostsPageData> => {
    const [bootstrap, token] = await Promise.all([
      loadProtectedBootstrap(),
      getServerAuthToken(),
    ]);

    if (!bootstrap || !hasUsableServerAuthToken(token)) {
      return {
        brandId: null,
        organizationId: null,
        postPresets: [],
        posts: [],
        pagination: {
          page: currentPage,
          pageSize: ITEMS_PER_PAGE,
          total: 0,
          totalPages: 1,
        },
      };
    }

    const { brandId, organizationId } = bootstrap;

    const query: IQueryParams & {
      executionState?: string;
      platform?: string;
      publicationState?: string;
      search?: string;
      sort?: string;
      visibility?: string;
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
      Object.assign(query, mapPostsListStatusFilter(status));
    }

    if (search) {
      query.search = search;
    }

    if (sort) {
      query.sort = sort;
    }

    const emptyPostsPage: IPaginatedResponse<IPost> = {
      hasNext: false,
      hasPrevious: currentPage > 1,
      items: [],
      page: currentPage,
      pageSize: ITEMS_PER_PAGE,
      total: 0,
      totalPages: 1,
    };

    const postsPromise =
      (scope === PageScope.BRAND || scope === PageScope.PUBLISHING) && brandId
        ? BrandsService.getInstance(token)
            .findBrandPostsPage(brandId, query)
            .catch((error) => {
              logger.error('Failed to load initial brand posts', error);
              return emptyPostsPage;
            })
        : scope === PageScope.ORGANIZATION && organizationId
          ? OrganizationsService.getInstance(token)
              .findOrganizationPostsPage(organizationId, query)
              .catch((error) => {
                logger.error(
                  'Failed to load initial organization posts',
                  error,
                );
                return emptyPostsPage;
              })
          : Promise.resolve(emptyPostsPage);

    const postPresetsPromise =
      scope === PageScope.PUBLISHING
        ? PresetsService.getInstance(token)
            .findAllPages({
              category: ModelCategory.TEXT,
            })
            .then((presets) =>
              (presets as IPreset[]).filter((preset) =>
                preset.key.startsWith('preset.text.post.'),
              ),
            )
            .catch((error) => {
              logger.error('Failed to load initial post presets', error);
              return [];
            })
        : Promise.resolve([]);

    const [postsPage, postPresets] = await Promise.all([
      postsPromise,
      postPresetsPromise,
    ]);

    return {
      brandId,
      organizationId,
      postPresets: JSON.parse(JSON.stringify(postPresets)) as IPreset[],
      posts: JSON.parse(JSON.stringify(postsPage.items)) as IPost[],
      pagination: {
        page: postsPage.page,
        pageSize: postsPage.pageSize,
        total: postsPage.total,
        totalPages: postsPage.totalPages,
      },
    };
  },
);
