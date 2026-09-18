'use client';

import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import type { OutlierBaselineDrawerProps } from '@props/analytics/analytics-outliers.props';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@ui/primitives/sheet';
import { Text } from '@ui/typography/text';
import { useTranslations } from 'next-intl';

function formatTimestamp(value: string | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toISOString().replace('T', ' ').replace('Z', ' UTC');
}

export default function OutlierBaselineDrawer({
  isOpen,
  isLoading,
  posts,
  snapshot,
  onClose,
}: OutlierBaselineDrawerProps) {
  const contributors = posts.filter((post) => post.isContributor);
  const excluded = posts.filter((post) => post.exclusionReasons.length > 0);
  const unknown = posts.filter(
    (post) => post.isPinnedUnknown || post.isPromotedUnknown,
  );
  const translate = useTranslations('pages.analytics.outliers');

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col gap-4 overflow-y-auto sm:max-w-lg"
      >
        <SheetHeader>
          <SheetTitle>{translate('baseline')}</SheetTitle>
          <SheetDescription>{translate('sheetDescription')}</SheetDescription>
        </SheetHeader>
        {isLoading ? (
          <Text size="sm" color="subtle-60">
            {translate('loadingBaseline')}
          </Text>
        ) : snapshot ? (
          <div className="space-y-6">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-foreground/60">
                  {translate('medianViews')}
                </dt>
                <dd className="font-semibold">
                  {snapshot.medianViews == null
                    ? '—'
                    : formatCompactNumber(snapshot.medianViews)}
                </dd>
              </div>
              <div>
                <dt className="text-foreground/60">
                  {translate('sampleSize')}
                </dt>
                <dd className="font-semibold">{snapshot.sampleSize}</dd>
              </div>
              <div>
                <dt className="text-foreground/60">{translate('window')}</dt>
                <dd className="font-semibold">{snapshot.windowSize}</dd>
              </div>
              <div>
                <dt className="text-foreground/60">{translate('computed')}</dt>
                <dd className="font-semibold">
                  {formatTimestamp(snapshot.computedAt)}
                </dd>
              </div>
              <div>
                <dt className="text-foreground/60">{translate('status')}</dt>
                <dd className="font-semibold">{snapshot.status}</dd>
              </div>
            </dl>
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">
                {translate('contributingPosts')}
              </h3>
              {contributors.length === 0 ? (
                <Text size="sm" color="subtle-60">
                  {translate('noContributors')}
                </Text>
              ) : (
                <ul className="space-y-1 text-sm">
                  {contributors.map((post) => (
                    <li key={post.id}>
                      {post.logicalPostId} ·{' '}
                      {post.views == null
                        ? '—'
                        : formatCompactNumber(post.views)}{' '}
                      {translate('views')}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">
                {translate('excludedPosts')}
              </h3>
              {excluded.length === 0 ? (
                <Text size="sm" color="subtle-60">
                  {translate('noExcluded')}
                </Text>
              ) : (
                <ul className="space-y-1 text-sm">
                  {excluded.map((post) => (
                    <li key={post.id}>
                      {post.logicalPostId} · {post.exclusionReasons.join(', ')}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">
                {translate('unknownEligibility')}
              </h3>
              {unknown.length === 0 ? (
                <Text size="sm" color="subtle-60">
                  {translate('unknownEligibilityReady')}
                </Text>
              ) : (
                <ul className="space-y-1 text-sm">
                  {unknown.map((post) => (
                    <li key={post.id}>
                      {post.logicalPostId}
                      {post.isPinnedUnknown
                        ? ` · ${translate('pinnedUnknown')}`
                        : ''}
                      {post.isPromotedUnknown
                        ? ` · ${translate('promotedUnknown')}`
                        : ''}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : (
          <Text size="sm" color="subtle-60">
            {translate('selectPost')}
          </Text>
        )}
      </SheetContent>
    </Sheet>
  );
}
