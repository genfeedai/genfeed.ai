import 'server-only';

import {
  getServerAuthToken,
  hasUsableServerAuthToken,
  loadProtectedBootstrap,
} from '@app-server/protected-bootstrap.server';
import { ITEMS_PER_PAGE } from '@genfeedai/constants';
import {
  type CredentialPlatform,
  PageScope,
  type PostCategory,
  type TargetExecutionState,
} from '@genfeedai/enums';
import type { IReleaseGroup } from '@genfeedai/interfaces';
import type {
  ReleasePostsPublicationState,
  ReleasePostsSort,
} from '@pages/posts/list/release-posts-list-query';
import { ReleaseGroupsService } from '@services/content/release-groups.service';
import { logger } from '@services/core/logger.service';
import { cache } from 'react';

export interface ReleasePostsPageData {
  brandId: string | null;
  organizationId: string | null;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  releases: IReleaseGroup[];
}

export interface LoadReleasePostsPageDataOptions {
  campaignId?: string;
  contentTypes?: PostCategory[];
  credentialIds?: string[];
  currentPage: number;
  executionStates?: TargetExecutionState[];
  platform?: CredentialPlatform;
  publicationState?: ReleasePostsPublicationState;
  scope: PageScope;
  search?: string;
  sort: ReleasePostsSort;
}

export const loadReleasePostsPageData = cache(
  async ({
    campaignId,
    contentTypes,
    credentialIds,
    currentPage,
    executionStates,
    platform,
    publicationState,
    scope,
    search,
    sort,
  }: LoadReleasePostsPageDataOptions): Promise<ReleasePostsPageData> => {
    const [bootstrap, token] = await Promise.all([
      loadProtectedBootstrap(),
      getServerAuthToken(),
    ]);
    const empty: ReleasePostsPageData = {
      brandId: bootstrap?.brandId ?? null,
      organizationId: bootstrap?.organizationId ?? null,
      pagination: {
        page: currentPage,
        pageSize: ITEMS_PER_PAGE,
        total: 0,
        totalPages: 1,
      },
      releases: [],
    };

    if (!bootstrap || !hasUsableServerAuthToken(token)) {
      return empty;
    }

    try {
      const page = await ReleaseGroupsService.getInstance(token).findAllPage({
        ...((scope === PageScope.BRAND || scope === PageScope.PUBLISHING) &&
        bootstrap.brandId
          ? { brandId: bootstrap.brandId }
          : {}),
        ...(campaignId ? { campaignId } : {}),
        ...(contentTypes?.length ? { contentType: contentTypes } : {}),
        ...(credentialIds?.length ? { credentialId: credentialIds } : {}),
        ...(executionStates?.length ? { executionState: executionStates } : {}),
        limit: ITEMS_PER_PAGE,
        page: currentPage,
        ...(platform ? { platform: [platform] } : {}),
        ...(publicationState ? { publicationState } : {}),
        ...(search ? { search } : {}),
        sort,
      });

      return {
        brandId: bootstrap.brandId,
        organizationId: bootstrap.organizationId,
        pagination: {
          page: page.page,
          pageSize: page.pageSize,
          total: page.total,
          totalPages: page.totalPages,
        },
        releases: JSON.parse(JSON.stringify(page.items)) as IReleaseGroup[],
      };
    } catch (error) {
      logger.error('Failed to load canonical publish releases', error);
      return empty;
    }
  },
);
