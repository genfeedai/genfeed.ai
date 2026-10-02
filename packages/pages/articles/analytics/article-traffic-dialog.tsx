'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type {
  ArticleTraffic,
  ArticleTrafficPeriod,
} from '@genfeedai/contracts/interfaces/content/article-traffic.interface';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import type {
  ArticleTrafficDialogProps,
  ArticleTrafficPeriodOption,
} from '@props/content/article-traffic.props';
import { ArticlesService } from '@services/content/articles.service';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';

const ArticleTrafficChart = dynamic(() => import('./article-traffic-chart'), {
  ssr: false,
});
const PERIODS: ReadonlyArray<ArticleTrafficPeriodOption> = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: 'all', label: 'Since publication' },
];
const UNAVAILABLE_MESSAGES = {
  not_configured:
    'Website traffic reporting is not configured for this workspace yet.',
  not_published:
    'Traffic is available after this article is published on the public website.',
  not_canonical:
    'This article does not own the public URL. Traffic is unavailable.',
  upstream_error:
    'Website traffic is temporarily unavailable. Try again shortly.',
};

export default function ArticleTrafficDialog({
  article,
  onClose,
}: ArticleTrafficDialogProps) {
  const { organizationId, brandId } = useCollectionScope();
  const getService = useAuthedService(
    useCallback((token: string) => ArticlesService.getInstance(token), []),
  );
  const [period, setPeriod] = useState<ArticleTrafficPeriod>('30d');
  const [traffic, setTraffic] = useState<ArticleTraffic | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [reload, setReload] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Reload and collection scope deliberately invalidate the in-flight report.
  useEffect(() => {
    if (!organizationId) {
      setIsLoading(false);
      return;
    }
    const controller = new AbortController();
    setIsLoading(true);
    setTraffic(null);
    setIsError(false);
    void (async () => {
      try {
        const service = await getService();
        if (controller.signal.aborted) return;
        const data = await service.getWebsiteTraffic(
          article.id,
          period,
          controller.signal,
        );
        if (!controller.signal.aborted) setTraffic(data);
      } catch {
        if (!controller.signal.aborted) setIsError(true);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();
    return () => controller.abort();
  }, [article.id, period, getService, organizationId, brandId, reload]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Article traffic</DialogTitle>
          <DialogDescription>{article.label}</DialogDescription>
        </DialogHeader>
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Traffic period"
        >
          {PERIODS.map((option) => (
            <Button
              key={option.value}
              aria-pressed={period === option.value}
              variant={
                period === option.value
                  ? ButtonVariant.DEFAULT
                  : ButtonVariant.SECONDARY
              }
              onClick={() => setPeriod(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
        {isLoading ? <p role="status">Loading website traffic…</p> : null}
        {isError || traffic?.status === 'unavailable' ? (
          <div className="space-y-3" role="status">
            <p>
              {isError
                ? 'Unable to load article traffic.'
                : UNAVAILABLE_MESSAGES[traffic?.reason ?? 'upstream_error']}
            </p>
            <Button
              variant={ButtonVariant.SECONDARY}
              onClick={() => setReload((value) => value + 1)}
            >
              Retry
            </Button>
          </div>
        ) : null}
        {traffic?.status === 'available' ? (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm text-muted-foreground">Website views</dt>
                <dd className="text-2xl font-semibold">
                  {traffic.totalViews?.toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">
                  Resource actions
                </dt>
                <dd className="text-2xl font-semibold">
                  {traffic.totalResourceClicks?.toLocaleString()}
                </dd>
              </div>
            </dl>
            <ArticleTrafficChart days={traffic.days} />
            <p className="text-xs text-muted-foreground">
              Recorded pageviews, including repeat visits, internal and
              automated traffic. Resource actions include skill links, install
              command copies, Skills Pro, agent and MCP setup. Daily totals use
              UTC; today is partial. Data is limited by analytics retention and
              collection.
            </p>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
