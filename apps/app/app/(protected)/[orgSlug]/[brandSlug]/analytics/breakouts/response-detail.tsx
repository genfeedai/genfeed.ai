'use client';

import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { BreakoutResponseDetailProps } from '@props/analytics/breakout-response-detail.props';
import { Badge } from '@ui/primitives/badge';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';

export default function BreakoutResponseDetail({
  response,
}: BreakoutResponseDetailProps) {
  const t = useTranslations('pages.analytics.breakouts.detail');
  const locale = useLocale();
  const { href } = useOrgUrl();
  const { source, trigger, capacity } = response;
  const metricValue = (value: number | null) =>
    value === null ? t('unavailable') : value.toLocaleString(locale);
  return (
    <section aria-label={t('label')} className="space-y-5">
      <Heading as="h2">{t('heading')}</Heading>
      <Text as="p" size="sm">
        {t('responseState', { state: response.state.replaceAll('_', ' ') })}
      </Text>
      <Text as="p" color="muted" size="sm">
        {t('notice')}
      </Text>
      <div className="space-y-2">
        <Heading as="h3" size="md">
          {t('sourceHeading')}
        </Heading>
        <Text as="p">
          {response.platform} · {source.format ?? t('unknownFormat')}
        </Text>
        <Text as="p" size="sm" className="break-all">
          {t('originalPost', { externalId: source.externalId })}
        </Text>
        {source.kind === 'post' && source.id && (
          <Link
            className="text-sm underline"
            href={href(
              `${APP_ROUTES.PUBLISHING.POSTS}/${encodeURIComponent(source.id)}`,
            )}
          >
            {t('openOriginal')}
          </Link>
        )}
        {source.status !== 'current' && (
          <Text as="p" color="destructive" role="status">
            {t('sourceChanged')}
          </Text>
        )}
        {trigger ? (
          <div className="space-y-1">
            <Text as="p">
              {t('performance', {
                ratio:
                  trigger.ratio === null
                    ? t('unavailable')
                    : `${trigger.ratio.toLocaleString(locale)}×`,
              })}
            </Text>
            <Text as="p">
              {t('metrics', {
                metric: trigger.metric,
                value: metricValue(trigger.targetValue),
                median: metricValue(trigger.median),
                sampleSize: trigger.sampleSize,
              })}
            </Text>
            <Text as="p" color="muted" size="sm">
              {t('provenance', {
                scope: trigger.exposureScope ?? t('legacyProvenance'),
              })}
            </Text>
            <Text as="p" color="muted" size="sm">
              {t('evidenceRecorded', {
                evaluatedAt: trigger.evaluatedAt,
                source: trigger.metricSource ?? t('unknownMetricSource'),
              })}
            </Text>
          </div>
        ) : (
          <Text as="p" role="status">
            {t('triggerUnavailable')}
          </Text>
        )}
      </div>
      <div className="space-y-3">
        <Heading as="h3" size="md">
          {t('outputsHeading')}
        </Heading>
        {response.outputRegistryStatus === 'conflict' ? (
          <Text as="p" role="status">
            {t('outputsConflict')}
          </Text>
        ) : response.outputs === null ? (
          <Text as="p" role="status">
            {t('outputsNotLoaded')}
          </Text>
        ) : response.outputs.length === 0 ? (
          <Text as="p">{t('outputsEmpty')}</Text>
        ) : (
          response.outputs.map((output) => (
            <div
              key={output.id}
              className="space-y-2 rounded-lg border border-border p-4"
            >
              <Heading as="h4" size="sm">
                {t('outputTitle', {
                  ordinal: output.ordinal,
                  kind:
                    output.kind === 'quote'
                      ? t('kindQuote')
                      : t('kindFollowUp'),
                  format: output.format,
                })}
              </Heading>
              {output.recovery.status === 'unavailable' ? (
                <Text as="p" role="status">
                  {t('outputUnavailable')}
                </Text>
              ) : (
                <>
                  <Badge>{t(`states.${output.recovery.state}`)}</Badge>
                  <Text as="p" size="sm">
                    {t(`reasons.${output.recovery.reason}`)}
                  </Text>
                  {output.recovery.postId && (
                    <Link
                      className="text-sm underline"
                      href={href(
                        `${APP_ROUTES.PUBLISHING.POSTS}/${encodeURIComponent(output.recovery.postId)}`,
                      )}
                    >
                      {t('openFollowUp', { ordinal: output.ordinal })}
                    </Link>
                  )}
                  {output.recovery.state === 'published' &&
                    output.recovery.externalId && (
                      <Text as="p" size="sm" className="break-all">
                        {t('publishedPost', {
                          externalId: output.recovery.externalId,
                        })}
                      </Text>
                    )}
                </>
              )}
            </div>
          ))
        )}
      </div>
      <div className="space-y-2">
        <Heading as="h3" size="md">
          {t('capacityHeading')}
        </Heading>
        {capacity === null ? (
          <Text as="p" color="muted" size="sm">
            {t('capacityUnchecked')}
          </Text>
        ) : capacity.status === 'held' ? (
          <Text as="p" role="status">
            {t('capacityHeld', {
              reason: t(`capacityReasons.${capacity.reason}`),
            })}
          </Text>
        ) : (
          <>
            <Text as="p">
              {t('remainingSlots', {
                value: metricValue(capacity.remainingPublicationSlots),
              })}
            </Text>
            <Text as="p">
              {t('availableCredits', {
                value: metricValue(
                  capacity.budget.availableOrganizationCredits,
                ),
              })}
            </Text>
            <Text as="p" color="muted" size="sm">
              {t('snapshot', { capturedAt: capacity.capturedAt })}
            </Text>
          </>
        )}
      </div>
      <Text as="p" color="muted" size="xs">
        {t('statusRead', { readAt: response.readAt })}
      </Text>
    </section>
  );
}
