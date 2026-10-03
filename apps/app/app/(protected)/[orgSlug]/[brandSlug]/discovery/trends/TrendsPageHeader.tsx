import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import CorpusHealthPanel from '@pages/trends/shared/corpus-health-panel';
import type { Props } from '@props/analytics/trends-page-header.props';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import { useTranslations } from 'next-intl';

export default function TrendsPageHeader({
  corpusHealth,
  formattedLastSyncedAt,
  isCorpusHealthUnavailable,
  videoCount,
  platformCount,
  leadingPlatform,
  totalTrackedTopics,
}: Props) {
  const translate = useTranslations('pages.analytics.trends');

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
              {translate('header.latestObserved', {
                date: formattedLastSyncedAt,
              })}
            </Text>
          )}

          <Text size="sm" color="subtle-60">
            {translate('header.tracking', { platformCount, videoCount })}
          </Text>

          {leadingPlatform && leadingPlatform.totalMentions > 0 && (
            <Text size="sm" color="subtle-60">
              {translate('header.highestVolume')}{' '}
              <Text weight="semibold" color="default">
                {leadingPlatform.label}
              </Text>{' '}
              {translate('header.mentions', {
                count: formatCompactNumber(leadingPlatform.totalMentions),
              })}
            </Text>
          )}
          <Text size="sm" color="subtle-60">
            {translate('header.keywords', { count: totalTrackedTopics })}
          </Text>
        </div>
        <Heading size="2xl" as="h1" className="sr-only">
          {translate('page.heading')}
        </Heading>
      </div>
    </header>
  );
}
