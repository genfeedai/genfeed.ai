import {
  PageScope,
  PostStatus,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { fetchPosts } from '@pages/posts/list/components/posts-query.helpers';
import {
  buildPostsListQueryKey,
  getDefaultPostsSort,
  parsePostsPublicationState,
  parsePostsStatus,
} from '@pages/posts/list/posts-list-query';
import { describe, expect, it, vi } from 'vitest';

describe('posts list query helpers', () => {
  it('builds the shared posts list query key used by server hydration and client queries', () => {
    expect(
      buildPostsListQueryKey({
        adminBrand: '',
        adminOrg: '',
        brandId: 'brand_123',
        currentPage: 2,
        filterSearch: 'launch',
        filterSort: 'scheduledDate: 1',
        filterStatus: PostStatus.SCHEDULED,
        organizationId: 'org_123',
        platformFilter: 'linkedin',
        publicationState: 'not-posted',
        scope: PageScope.PUBLISHING,
        status: PostStatus.SCHEDULED,
      }),
    ).toEqual([
      'posts-list',
      PageScope.PUBLISHING,
      'brand_123',
      'org_123',
      'linkedin',
      'not-posted',
      'launch',
      PostStatus.SCHEDULED,
      'scheduledDate: 1',
      2,
      PostStatus.SCHEDULED,
      '',
      '',
    ]);
  });

  it('keeps the server and client default sort rules aligned', () => {
    expect(getDefaultPostsSort(PostStatus.SCHEDULED)).toBe('scheduledDate: 1');
    expect(getDefaultPostsSort(PostStatus.PUBLIC)).toBe('scheduledDate: -1');
    expect(getDefaultPostsSort()).toBe('createdAt: -1');
  });

  it('accepts only canonical URL-backed publication facets', () => {
    expect(parsePostsPublicationState('not-posted')).toBe('not-posted');
    expect(parsePostsPublicationState('posted')).toBe('posted');
    expect(parsePostsPublicationState('published')).toBeUndefined();
    expect(parsePostsPublicationState()).toBeUndefined();
  });

  it('accepts only canonical PostStatus query values', () => {
    expect(parsePostsStatus(PostStatus.DRAFT)).toBe(PostStatus.DRAFT);
    expect(parsePostsStatus(PostStatus.PROCESSING)).toBe(PostStatus.PROCESSING);
    expect(parsePostsStatus('ready_for_review')).toBeUndefined();
    expect(parsePostsStatus()).toBeUndefined();
  });

  it('uses canonical tenant filters for superadmin post queries', async () => {
    const findAllPage = vi.fn().mockResolvedValue({
      hasNext: false,
      hasPrevious: false,
      items: [],
      page: 1,
      pageSize: 12,
      total: 0,
      totalPages: 1,
    });

    await fetchPosts({
      adminBrand: 'brand_123',
      adminOrg: 'org_123',
      brandId: undefined,
      currentPage: 1,
      filterSearch: '',
      filterSort: undefined,
      filterStatus: '',
      getBrandsService: vi.fn(),
      getOrganizationsService: vi.fn(),
      getPostsService: vi.fn().mockResolvedValue({ findAllPage }),
      organizationId: undefined,
      platformFilter: undefined,
      scope: PageScope.SUPERADMIN,
      status: undefined,
    } as never);

    expect(findAllPage).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand_123',
        organizationId: 'org_123',
      }),
    );
    expect(findAllPage.mock.calls[0]?.[0]).not.toHaveProperty('status');
  });

  it('sends executionState to the posts API instead of Post.status', async () => {
    const findOrganizationPostsPage = vi.fn().mockResolvedValue({
      hasNext: false,
      hasPrevious: false,
      items: [],
      page: 1,
      pageSize: 12,
      total: 0,
      totalPages: 1,
    });

    await fetchPosts({
      adminBrand: '',
      adminOrg: '',
      brandId: undefined,
      currentPage: 1,
      filterSearch: '',
      filterSort: undefined,
      filterStatus: PostStatus.DRAFT,
      getBrandsService: vi.fn(),
      getOrganizationsService: vi.fn().mockResolvedValue({
        findOrganizationPostsPage,
      }),
      getPostsService: vi.fn(),
      organizationId: 'org_123',
      platformFilter: undefined,
      scope: PageScope.ORGANIZATION,
      status: undefined,
    } as never);

    expect(findOrganizationPostsPage).toHaveBeenCalledWith(
      'org_123',
      expect.objectContaining({
        executionState: TargetExecutionState.DRAFT,
      }),
    );
    expect(findOrganizationPostsPage.mock.calls[0]?.[1]).not.toHaveProperty(
      'status',
    );
  });

  it('maps projected public status onto published execution and visibility', async () => {
    const findOrganizationPostsPage = vi.fn().mockResolvedValue({
      hasNext: false,
      hasPrevious: false,
      items: [],
      page: 1,
      pageSize: 12,
      total: 0,
      totalPages: 1,
    });

    await fetchPosts({
      adminBrand: '',
      adminOrg: '',
      brandId: undefined,
      currentPage: 1,
      filterSearch: '',
      filterSort: undefined,
      filterStatus: PostStatus.PUBLIC,
      getBrandsService: vi.fn(),
      getOrganizationsService: vi.fn().mockResolvedValue({
        findOrganizationPostsPage,
      }),
      getPostsService: vi.fn(),
      organizationId: 'org_123',
      platformFilter: undefined,
      scope: PageScope.ORGANIZATION,
      status: undefined,
    } as never);

    expect(findOrganizationPostsPage).toHaveBeenCalledWith(
      'org_123',
      expect.objectContaining({
        executionState: TargetExecutionState.PUBLISHED,
        visibility: PostVisibility.PUBLIC,
      }),
    );
    expect(findOrganizationPostsPage.mock.calls[0]?.[1]).not.toHaveProperty(
      'status',
    );
  });
});
