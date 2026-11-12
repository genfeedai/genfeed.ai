'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ComponentSize, PageScope, PostStatus } from '@genfeedai/contracts';
import type { IPost } from '@genfeedai/contracts/interfaces';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { PostsService } from '@services/content/posts.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import { BrandsService } from '@services/social/brands.service';
import PlatformBadge from '@ui/components/display/platform-badge/PlatformBadge';
import { useLocale, useTranslations } from 'next-intl';
import { fetchPosts } from '@/features/posts/list/components/posts-query.helpers';
import type { AppRailPreviewContentProps } from '@/props/ui/app-rail.props';
import {
  RailPreviewLinkRow,
  RailPreviewSection,
  RailPreviewState,
} from './rail-preview-parts';

const PREVIEW_LIMIT = 5;

interface PublishingServices {
  brands: BrandsService;
  organizations: OrganizationsService;
  posts: PostsService;
}

function postTitle(post: IPost, fallback: string): string {
  return post.label?.trim() || post.description?.trim() || fallback;
}

/** Publishing: what goes out next. */
export default function PublishingRailPreview({
  href,
}: AppRailPreviewContentProps) {
  const translate = useTranslations('common.appRail.preview.publishing');
  const locale = useLocale();
  const { brandId, organizationId } = useBrand();
  const posts = useAuthedQuery<PublishingServices, IPost[]>({
    enabled: Boolean(organizationId),
    queryFn: async (services) => {
      const result = await fetchPosts({
        adminBrand: '',
        adminOrg: '',
        brandId: brandId || undefined,
        currentPage: 1,
        filterSearch: '',
        filterSort: undefined,
        filterStatus: PostStatus.SCHEDULED,
        getBrandsService: async () => services.brands,
        getOrganizationsService: async () => services.organizations,
        getPostsService: async () => services.posts,
        organizationId: organizationId || undefined,
        platformFilter: undefined,
        scope: brandId ? PageScope.BRAND : PageScope.ORGANIZATION,
        status: undefined,
      });
      return [...result.posts]
        .sort(
          (a, b) =>
            new Date(a.scheduledDate ?? 0).getTime() -
            new Date(b.scheduledDate ?? 0).getTime(),
        )
        .slice(0, PREVIEW_LIMIT);
    },
    queryKey: [
      'app-rail-preview',
      'publishing',
      organizationId || null,
      brandId || null,
    ],
    service: (token: string): PublishingServices => ({
      brands: BrandsService.getInstance(token),
      organizations: OrganizationsService.getInstance(token),
      posts: PostsService.getInstance(token),
    }),
    staleTime: 30_000,
  });
  const items = posts.data ?? [];

  return (
    <RailPreviewSection title={translate('title')}>
      <RailPreviewState
        emptyLabel={translate('empty')}
        isEmpty={items.length === 0}
        isError={posts.isError}
        isLoading={posts.isPending}
      >
        <ul>
          {items.map((post) => (
            <RailPreviewLinkRow
              href={href}
              key={post.id}
              leading={
                post.platform ? (
                  <PlatformBadge
                    platform={post.platform}
                    showLabel={false}
                    size={ComponentSize.MD}
                  />
                ) : undefined
              }
              subtitle={
                post.scheduledDate
                  ? new Date(post.scheduledDate).toLocaleString(locale, {
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      month: 'short',
                    })
                  : undefined
              }
              title={postTitle(post, translate('untitled'))}
            />
          ))}
        </ul>
      </RailPreviewState>
    </RailPreviewSection>
  );
}
