'use client';

import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import Badge from '@ui/display/badge/Badge';
import { VStack } from '@ui/layout/stack';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';

type Props = {
  formattedLastSyncedAt: string;
  videoCount: number;
  platformCount: number;
  leadingPlatform: { label: string; totalMentions: number } | null;
  totalTrackedTopics: number;
};

export default function TrendsPageHeader({
  formattedLastSyncedAt,
  videoCount,
  platformCount,
  leadingPlatform,
  totalTrackedTopics,
}: Props) {
  return (
    <header>
      <VStack gap={3}>
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="default" className="text-xs uppercase tracking-wide">
            Live sync
          </Badge>

          {formattedLastSyncedAt && (
            <Text size="sm" color="subtle-60">
              Last updated {formattedLastSyncedAt}
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
        <Heading size="2xl" as="h1">
          Social Media Trends
        </Heading>
        <Text as="p" color="subtle-70" className="max-w-3xl">
          Monitor competitor hooks, creators, and viral moments so you can
          replicate the playbook for your next campaign.
        </Text>
      </VStack>
    </header>
  );
}
