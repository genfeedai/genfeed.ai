import 'server-only';

import {
  getServerAuthToken,
  loadProtectedBootstrap,
} from '@app-server/protected-bootstrap.server';
import { ITEMS_PER_PAGE } from '@genfeedai/constants';
import { ModelCategory, PageScope, PostStatus } from '@genfeedai/enums';
import type { IPost, IPreset, IQueryParams } from '@genfeedai/interfaces';
import { logger } from '@services/core/logger.service';
import { PresetsService } from '@services/elements/presets.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import { BrandsService } from '@services/social/brands.service';
import { cache } from 'react';

export interface PostsPageData {
  postPresets: IPreset[];
  posts: IPost[];
}

export interface LoadPostsPageDataOptions {
  currentPage: number;
  platformFilter?: string;
  scope: PageScope;
  search?: string;
  sort?: string;
  status?: PostStatus;
}

export const loadPostsPageData = cache(
  async ({
    currentPage,
    platformFilter,
    scope,
    search,
    sort,
    status,
  }: LoadPostsPageDataOptions): Promise<PostsPageData> => {
    const [bootstrap, token] = await Promise.all([
      loadProtectedBootstrap(),
      getServerAuthToken(),
    ]);

    if (!bootstrap || !token) {
      return {
        postPresets: [],
        posts: [],
      };
    }

    const { brandId, organizationId } = bootstrap;

    const query: IQueryParams & {
      platform?: string;
      search?: string;
      sort?: string;
      status?: string;
    } = {
      limit: ITEMS_PER_PAGE,
      page: currentPage,
    };

    if (platformFilter) {
      query.platform = platformFilter;
    }

    if (status) {
      query.status = status;
    }

    if (search) {
      query.search = search;
    }

    if (sort) {
      query.sort = sort;
    }

    const postsPromise =
      (scope === PageScope.BRAND || scope === PageScope.PUBLISHER) && brandId
        ? BrandsService.getInstance(token)
            .findBrandPosts(brandId, query)
            .catch((error) => {
              logger.error('Failed to load initial brand posts', error);
              return [];
            })
        : scope === PageScope.ORGANIZATION && organizationId
          ? OrganizationsService.getInstance(token)
              .findOrganizationPosts(organizationId, query)
              .catch((error) => {
                logger.error(
                  'Failed to load initial organization posts',
                  error,
                );
                return [];
              })
          : Promise.resolve([]);

    const postPresetsPromise =
      scope === PageScope.PUBLISHER
        ? PresetsService.getInstance(token)
            .findAll({
              category: ModelCategory.TEXT,
              limit: ITEMS_PER_PAGE,
              pagination: false,
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

    const [posts, postPresets] = await Promise.all([
      postsPromise,
      postPresetsPromise,
    ]);

    return {
      postPresets: JSON.parse(JSON.stringify(postPresets)) as IPreset[],
      posts: JSON.parse(
        JSON.stringify(
          scope === PageScope.PUBLISHER && !status
            ? posts.filter((post) => post.status !== PostStatus.PUBLIC)
            : posts,
        ),
      ) as IPost[],
    };
  },
);
