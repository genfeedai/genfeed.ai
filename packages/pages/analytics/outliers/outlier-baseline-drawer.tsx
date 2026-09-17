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
          <SheetTitle>Baseline</SheetTitle>
          <SheetDescription>
            Median views from the latest eligible posts, with exclusions.
          </SheetDescription>
        </SheetHeader>
        {isLoading ? (
          <Text size="sm" color="subtle-60">
            Loading baseline…
          </Text>
        ) : snapshot ? (
          <div className="space-y-6">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-foreground/60">Median views</dt>
                <dd className="font-semibold">
                  {snapshot.medianViews == null
                    ? '—'
                    : formatCompactNumber(snapshot.medianViews)}
                </dd>
              </div>
              <div>
                <dt className="text-foreground/60">Sample size</dt>
                <dd className="font-semibold">{snapshot.sampleSize}</dd>
              </div>
              <div>
                <dt className="text-foreground/60">Window</dt>
                <dd className="font-semibold">{snapshot.windowSize}</dd>
              </div>
              <div>
                <dt className="text-foreground/60">Computed</dt>
                <dd className="font-semibold">
                  {formatTimestamp(snapshot.computedAt)}
                </dd>
              </div>
              <div>
                <dt className="text-foreground/60">Status</dt>
                <dd className="font-semibold">{snapshot.status}</dd>
              </div>
            </dl>
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Contributing posts</h3>
              {contributors.length === 0 ? (
                <Text size="sm" color="subtle-60">
                  No contributing posts in this snapshot.
                </Text>
              ) : (
                <ul className="space-y-1 text-sm">
                  {contributors.map((post) => (
                    <li key={post.id}>
                      {post.logicalPostId} ·{' '}
                      {post.views == null
                        ? '—'
                        : formatCompactNumber(post.views)}{' '}
                      views
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Excluded posts</h3>
              {excluded.length === 0 ? (
                <Text size="sm" color="subtle-60">
                  No excluded posts.
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
              <h3 className="text-sm font-semibold">Unknown eligibility</h3>
              {unknown.length === 0 ? (
                <Text size="sm" color="subtle-60">
                  Pinned and promoted state was available for this account.
                </Text>
              ) : (
                <ul className="space-y-1 text-sm">
                  {unknown.map((post) => (
                    <li key={post.id}>
                      {post.logicalPostId}
                      {post.isPinnedUnknown ? ' · pinned unknown' : ''}
                      {post.isPromotedUnknown ? ' · promoted unknown' : ''}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : (
          <Text size="sm" color="subtle-60">
            Select a post to inspect its baseline.
          </Text>
        )}
      </SheetContent>
    </Sheet>
  );
}
