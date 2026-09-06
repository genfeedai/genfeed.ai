'use client';

import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import CorpusHealthPanel from '@pages/trends/shared/corpus-health-panel';
import type { TrendCorpusFreshnessHealth } from '@props/trends/trends-page.props';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';

type Props = {
  corpusHealth: TrendCorpusFreshnessHealth | null;
  formattedLastSyncedAt: string;
  isCorpusHealthUnavailable: boolean;
  videoCount: number;
  platformCount: number;
  leadingPlatform: { label: string; totalMentions: number } | null;
  totalTrackedTopics: number;
};

export default function TrendsPageHeader({
  corpusHealth,
  formattedLastSyncedAt,
  isCorpusHealthUnavailable,
  videoCount,
  platformCount,
  leadingPlatform,
  totalTrackedTopics,
}: Props) {
  return (
    <header>
      <CorpusHealthPanel
        health={corpusHealth}
        isUnavailable={isCorpusHealthUnavailable}
      />
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {formattedLastSyncedAt && (
            <Text size="sm" color="subtle-60">
              Latest observed source {formattedLastSyncedAt}
            </Text>
          )}

          <Text size="sm" color="subtle-60">
            Tracking {videoCount} standout videos across {platformCount}{' '}
            platforms
          </Text>

          {leadingPlatform && leadingPlatform.totalMentions > 0 && (
            <Text size="sm" color="subtle-60">
              Highest term volume:{' '}
              <Text weight="semibold" color="default">
                {leadingPlatform.label}
              </Text>{' '}
              ({formatCompactNumber(leadingPlatform.totalMentions)} mentions)
            </Text>
          )}
          <Text size="sm" color="subtle-60">
            {totalTrackedTopics} active keywords monitored
          </Text>
        </div>
        <Heading size="2xl" as="h1" className="sr-only">
          Social Media Trends
        </Heading>
      </div>
    </header>
  );
}
