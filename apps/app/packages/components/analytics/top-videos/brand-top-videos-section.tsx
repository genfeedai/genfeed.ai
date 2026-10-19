'use client';

import { AlertCategory, ButtonVariant } from '@genfeedai/contracts';
import type { ITrendVideo } from '@genfeedai/contracts/interfaces';
import { formatDate } from '@helpers/formatting/date/date.helper';
import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import { useClientPagination } from '@hooks/data/pagination/use-client-pagination/use-client-pagination';
import HookRemixModal from '@pages/trends/list/components/HookRemixModal';
import { AnalyticsMetricLabel } from '@ui/analytics/metric-definition/AnalyticsMetricInfo';
import Badge from '@ui/display/badge/Badge';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import Table from '@ui/display/table/Table';
import Alert from '@ui/feedback/alert/Alert';
import Pagination from '@ui/navigation/pagination/Pagination';
import { Button } from '@ui/primitives/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@ui/primitives/collapsible';
import { Text } from '@ui/typography/text';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { useBrandTopVideos } from './use-brand-top-videos';

const PAGE_SIZE = 10;

/**
 * The brand's own recent videos ranked by evaluated score, with the persuasion
 * signal that explains why each one worked.
 */
export default function BrandTopVideosSection() {
  const translate = useTranslations('ui.analyticsTrends');
  const translateCommon = useTranslations('common.errors');
  const translateTopVideos = useTranslations('pages.analytics.topVideos');
  const {
    hasReadError,
    isBrandReady,
    isLoading,
    isUsingCachedVideos,
    retryRead,
    timeframe,
    videos,
  } = useBrandTopVideos();
  const [remixVideo, setRemixVideo] = useState<ITrendVideo | null>(null);

  const rankedVideos = useMemo(
    () => videos.toSorted((a, b) => b.viralScore - a.viralScore),
    [videos],
  );

  const { currentPage, goToPage, pageItems, totalPages } = useClientPagination(
    rankedVideos,
    { pageSize: PAGE_SIZE, resetKey: timeframe },
  );

  if (!isBrandReady) {
    return null;
  }

  return (
    <div className="space-y-4">
      {hasReadError && (
        <Alert
          type={
            isUsingCachedVideos ? AlertCategory.WARNING : AlertCategory.ERROR
          }
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Text as="p" size="sm">
              {isUsingCachedVideos
                ? translate('cachedEvaluationWarning')
                : translateCommon('loadFailed')}
            </Text>
            <Button
              label={translate('retryEvaluationRead')}
              onClick={() => {
                void retryRead();
              }}
              variant={ButtonVariant.SECONDARY}
            />
          </div>
        </Alert>
      )}

      <Table<ITrendVideo>
        label={translateTopVideos('title')}
        items={pageItems}
        isLoading={isLoading}
        emptyLabel={translateTopVideos('empty')}
        onRowClick={(video) => {
          if (video.id) {
            setRemixVideo(video);
          }
        }}
        columns={[
          {
            className: 'w-10',
            header: '#',
            key: 'rank',
            render: (video) => (
              <span className="font-semibold text-foreground/70">
                {rankedVideos.findIndex((entry) => entry.id === video.id) + 1}
              </span>
            ),
          },
          {
            className: 'min-w-56',
            header: translateTopVideos('columns.video'),
            key: 'title',
            render: (video) => (
              <div className="flex flex-col gap-2">
                <span className="font-semibold text-foreground">
                  {video.title || video.hook || 'Untitled'}
                </span>
                {video.publishedAt && (
                  <span className="text-xs text-foreground/60">
                    {formatDate(video.publishedAt)}
                  </span>
                )}
              </div>
            ),
          },
          {
            className: 'min-w-32',
            header: translateTopVideos('columns.platform'),
            key: 'platform',
            render: (video) => <PlatformBadge platform={video.platform} />,
          },
          {
            className: 'min-w-24',
            header: (
              <AnalyticsMetricLabel metric="views">
                {translateTopVideos('columns.views')}
              </AnalyticsMetricLabel>
            ),
            key: 'views',
            render: (video) => (
              <span className="font-semibold text-foreground">
                {formatCompactNumber(video.views || video.viewCount || 0)}
              </span>
            ),
          },
          {
            className: 'min-w-32',
            header: (
              <AnalyticsMetricLabel metric="engagementRate">
                {translateTopVideos('columns.engagement')}
              </AnalyticsMetricLabel>
            ),
            key: 'engagementRate',
            render: (video) => (
              <span className="font-semibold text-foreground">
                {(video.engagementRate || 0).toFixed(1)}%
              </span>
            ),
          },
          {
            className: 'min-w-20 text-right',
            header: translateTopVideos('columns.score'),
            key: 'viralScore',
            render: (video) => {
              const rank =
                rankedVideos.findIndex((entry) => entry.id === video.id) + 1;
              const badgeTone =
                rank <= 3
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground';

              return (
                <Badge
                  value={Math.round(video.viralScore || 0)}
                  className={`${badgeTone} text-xs`}
                />
              );
            },
          },
          {
            className: 'min-w-40',
            header: translate('whyItWorks'),
            key: 'persuasionHighlight',
            render: (video) =>
              video.persuasionHighlight ? (
                <div className="max-w-sm space-y-2 break-words">
                  <Badge
                    value={`${video.persuasionHighlight.label} · ${video.persuasionHighlight.score}`}
                    className="bg-secondary/10 text-secondary text-xs"
                  />
                  {video.persuasionHighlight.analysisNote ? (
                    <Collapsible>
                      <CollapsibleTrigger className="py-1 text-left text-xs">
                        {translate('evaluatorObservation')}
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <Text
                          as="p"
                          size="sm"
                          className="whitespace-pre-wrap break-words"
                        >
                          {video.persuasionHighlight.analysisNote}
                        </Text>
                      </CollapsibleContent>
                    </Collapsible>
                  ) : (
                    <Text as="p" size="sm" color="subtle-60">
                      {translate('noWrittenPersuasionExplanation')}
                    </Text>
                  )}
                </div>
              ) : (
                <Text as="p" size="sm" color="subtle-60">
                  {translate('noPersuasionAnalysis')}
                </Text>
              ),
          },
        ]}
        getRowKey={(video) => video.id || video.externalId || ''}
      />
      <Pagination
        currentPage={currentPage}
        onPageChange={goToPage}
        totalItems={rankedVideos.length}
        totalLabel={translateTopVideos('totalLabel')}
        totalPages={totalPages}
      />

      <HookRemixModal
        video={remixVideo}
        isOpen={remixVideo !== null}
        onClose={() => setRemixVideo(null)}
      />
    </div>
  );
}
