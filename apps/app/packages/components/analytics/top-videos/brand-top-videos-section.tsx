'use client';

import { AlertCategory, ButtonVariant, Timeframe } from '@genfeedai/contracts';
import type { ITrendVideo } from '@genfeedai/contracts/interfaces';
import { formatDate } from '@helpers/formatting/date/date.helper';
import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import HookRemixModal from '@pages/trends/list/components/HookRemixModal';
import { AnalyticsMetricLabel } from '@ui/analytics/metric-definition/AnalyticsMetricInfo';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import Table from '@ui/display/table/Table';
import Alert from '@ui/feedback/alert/Alert';
import { Button } from '@ui/primitives/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@ui/primitives/collapsible';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import { PLATFORM_CONFIGS } from '@ui-constants/platform.constant';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import {
  type TopVideosTimeframe,
  useBrandTopVideos,
} from './use-brand-top-videos';

const TIMEFRAME_OPTIONS: { label: string; value: TopVideosTimeframe }[] = [
  { label: 'Last 24 hours', value: Timeframe.H24 },
  { label: 'Last 72 hours', value: Timeframe.H72 },
  { label: 'Last 7 days', value: Timeframe.D7 },
];

/**
 * The brand's own recent videos ranked by evaluated score, with the persuasion
 * signal that explains why each one worked.
 */
export default function BrandTopVideosSection() {
  const translate = useTranslations('ui.analyticsTrends');
  const translateCommon = useTranslations('common.errors');
  const {
    hasReadError,
    isBrandReady,
    isLoading,
    isUsingCachedVideos,
    retryRead,
    setTimeframe,
    timeframe,
    videos,
  } = useBrandTopVideos();
  const [remixVideo, setRemixVideo] = useState<ITrendVideo | null>(null);

  const rankedVideos = useMemo(
    () => videos.toSorted((a, b) => b.viralScore - a.viralScore),
    [videos],
  );

  if (!isBrandReady) {
    return null;
  }

  return (
    <Card className="backdrop-blur" bodyClassName="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Heading size="xl">Top videos</Heading>
          <Text as="p" size="sm" color="subtle-60">
            Your recent videos ranked by evaluated score, with the persuasion
            signal behind each one.
          </Text>
        </div>
        <Select
          value={timeframe}
          onValueChange={(value) => setTimeframe(value as TopVideosTimeframe)}
        >
          <SelectTrigger className="w-44" aria-label="Timeframe">
            <SelectValue placeholder="Timeframe" />
          </SelectTrigger>
          <SelectContent>
            {TIMEFRAME_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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
        items={rankedVideos}
        isLoading={isLoading}
        emptyLabel="No published videos in this timeframe yet."
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
            header: 'Video',
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
            header: 'Platform',
            key: 'platform',
            render: (video) => {
              const platform = PLATFORM_CONFIGS[video.platform];
              const Icon = platform?.icon;

              return (
                <div className="flex items-center gap-2">
                  {Icon && (
                    <span className="text-lg text-foreground/70">
                      <Icon />
                    </span>
                  )}
                  <span className="font-medium text-foreground">
                    {platform?.label ?? video.platform}
                  </span>
                </div>
              );
            },
          },
          {
            className: 'min-w-24',
            header: (
              <AnalyticsMetricLabel metric="views">Views</AnalyticsMetricLabel>
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
                Engagement
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
            header: 'Score',
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

      <HookRemixModal
        video={remixVideo}
        isOpen={remixVideo !== null}
        onClose={() => setRemixVideo(null)}
      />
    </Card>
  );
}
