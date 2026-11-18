'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ComponentSize } from '@genfeedai/contracts';
import type { ITrendVideo } from '@genfeedai/contracts/interfaces';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { TrendsService } from '@services/social/trends.service';
import PlatformBadge from '@ui/components/display/platform-badge/PlatformBadge';
import { useLocale, useTranslations } from 'next-intl';
import type { AppRailPreviewContentProps } from '@/props/ui/app-rail.props';
import {
  RailPreviewLinkRow,
  RailPreviewSection,
  RailPreviewState,
} from './rail-preview-parts';

const PREVIEW_LIMIT = 5;

/** Trends: the viral videos working for this brand right now. */
export default function DiscoveryRailPreview({
  href,
}: AppRailPreviewContentProps) {
  const translate = useTranslations('common.appRail.preview.discovery');
  const locale = useLocale();
  const { brandId } = useBrand();
  const videos = useAuthedQuery<TrendsService, ITrendVideo[]>({
    queryFn: (service, signal) =>
      service.getViralVideos({
        brandId: brandId || undefined,
        limit: PREVIEW_LIMIT,
        relevance: brandId ? 'brand' : 'market',
        signal,
        timeframe: '72h',
      }),
    queryKey: ['app-rail-preview', 'trends', brandId || null],
    service: (token: string) => TrendsService.getInstance(token),
    staleTime: 60_000,
  });
  const views = new Intl.NumberFormat(locale, { notation: 'compact' });
  const items = (videos.data ?? []).slice(0, PREVIEW_LIMIT);

  return (
    <RailPreviewSection title={translate('title')}>
      <RailPreviewState
        emptyLabel={translate('empty')}
        isEmpty={items.length === 0}
        isError={videos.isError}
        isLoading={videos.isPending}
      >
        <ul>
          {items.map((video) => {
            const count = video.views ?? video.viewCount;
            return (
              <RailPreviewLinkRow
                href={href}
                key={video.id}
                leading={
                  <PlatformBadge
                    platform={video.platform}
                    showLabel={false}
                    size={ComponentSize.MD}
                  />
                }
                subtitle={video.creatorHandle}
                title={video.title || video.topic || video.creatorHandle}
                trailing={
                  count === undefined
                    ? undefined
                    : translate('views', { count: views.format(count) })
                }
              />
            );
          })}
        </ul>
      </RailPreviewState>
    </RailPreviewSection>
  );
}
