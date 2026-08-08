'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { APP_ROUTES } from '@genfeedai/constants';
import {
  BatchItemStatus,
  ButtonSize,
  ButtonVariant,
  CardVariant,
} from '@genfeedai/enums';
import type { OverviewCard } from '@genfeedai/interfaces/ui/overview-card.interface';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { BatchesService } from '@services/batch/batches.service';
import { BrandsService } from '@services/social/brands.service';
import { useQuery } from '@tanstack/react-query';
import Card from '@ui/card/Card';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import OverviewLayout from '@ui/overview/OverviewLayout';
import { Button } from '@ui/primitives/button';
import {
  ArrowRight,
  Calendar,
  ClipboardCheck,
  LayoutDashboard,
  List,
  Send,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';

import { isReadyToReview } from '../review/components/review-state';

async function fetchPublicationTotal(
  getBrands: () => Promise<BrandsService>,
  brandId: string,
  publicationState: 'posted' | 'not-posted',
): Promise<number> {
  const service = await getBrands();
  const page = await service.findBrandPostsPage(brandId, {
    limit: 1,
    page: 1,
    publicationState,
  });
  return page.total ?? page.items?.length ?? 0;
}

export default function PublishOverviewPage() {
  const { href } = useOrgUrl();
  const { brandId } = useBrand();
  const getBatchesService = useAuthedService((token: string) =>
    BatchesService.getInstance(token),
  );
  const getBrandsService = useAuthedService((token: string) =>
    BrandsService.getInstance(token),
  );

  const { data: batches = [], isLoading: isBatchesLoading } = useQuery({
    queryKey: ['publish-overview-batches'],
    queryFn: async () => {
      const service = await getBatchesService();
      return service.getBatches();
    },
  });

  const { data: notPostedTotal = 0, isLoading: isNotPostedLoading } = useQuery({
    enabled: Boolean(brandId),
    queryKey: ['publish-overview-not-posted-total', brandId],
    queryFn: () =>
      fetchPublicationTotal(getBrandsService, brandId as string, 'not-posted'),
  });

  const { data: publishedTotal = 0, isLoading: isPublishedLoading } = useQuery({
    enabled: Boolean(brandId),
    queryKey: ['publish-overview-published-total', brandId],
    queryFn: () =>
      fetchPublicationTotal(getBrandsService, brandId as string, 'posted'),
  });

  const reviewPulse = useMemo(() => {
    const batchList = Array.isArray(batches) ? batches : [];
    let ready = 0;
    let failed = 0;
    let pending = 0;

    for (const batch of batchList) {
      for (const item of batch.items ?? []) {
        if (isReadyToReview(item)) {
          ready += 1;
        } else if (item.status === BatchItemStatus.FAILED) {
          failed += 1;
        } else if (
          item.status === BatchItemStatus.PENDING ||
          item.status === BatchItemStatus.PROCESSING
        ) {
          pending += 1;
        }
      }
    }

    return {
      activeBatches: batchList.length,
      failed,
      pending,
      ready,
    };
  }, [batches]);

  const isMetricsLoading =
    isBatchesLoading || isNotPostedLoading || isPublishedLoading;

  const kpiItems = [
    {
      description: 'Items waiting for human approval',
      isLoading: isMetricsLoading,
      label: 'Ready to review',
      value: reviewPulse.ready,
    },
    {
      description: 'Drafts and scheduled, not live yet',
      isLoading: isMetricsLoading,
      label: 'Not posted',
      value: notPostedTotal,
    },
    {
      description: 'Live on destinations',
      isLoading: isMetricsLoading,
      label: 'Published',
      value: publishedTotal,
    },
    {
      description: 'Generation failures in open batches',
      isLoading: isMetricsLoading,
      label: 'Failed items',
      value: reviewPulse.failed,
      valueClassName: reviewPulse.failed > 0 ? 'text-destructive' : undefined,
    },
  ];

  const cards: OverviewCard[] = [
    {
      color: 'bg-emerald-500/12 text-emerald-300',
      cta: 'Open Review',
      description:
        reviewPulse.ready > 0
          ? `${reviewPulse.ready} item${reviewPulse.ready === 1 ? '' : 's'} ready to approve or reject.`
          : 'No queue pressure — open Review when the next batch lands.',
      href: href(APP_ROUTES.PUBLISH.REVIEW),
      icon: ClipboardCheck,
      id: 'review',
      label: 'Review queue',
    },
    {
      color: 'bg-amber-500/12 text-amber-300',
      cta: 'Browse drafts',
      description:
        notPostedTotal > 0
          ? `${notPostedTotal} draft or scheduled post${notPostedTotal === 1 ? '' : 's'} in the pipeline.`
          : 'No drafts waiting — create a release when you are ready.',
      href: href(APP_ROUTES.PUBLISH.SCHEDULED),
      icon: List,
      id: 'drafts',
      label: 'Not posted',
    },
    {
      color: 'bg-sky-500/12 text-sky-300',
      cta: 'Open calendar',
      description: 'See what ships this week and drag to reschedule.',
      href: href(APP_ROUTES.PUBLISH.CALENDAR),
      icon: Calendar,
      id: 'calendar',
      label: 'Calendar',
    },
    {
      color: 'bg-violet-500/12 text-violet-300',
      cta: 'View published',
      description:
        publishedTotal > 0
          ? `${publishedTotal} live post${publishedTotal === 1 ? '' : 's'} across destinations.`
          : 'Nothing live yet — approved work will land here after publish.',
      href: href(APP_ROUTES.PUBLISH.PUBLISHED),
      icon: Send,
      id: 'published',
      label: 'Published',
    },
  ];

  return (
    <OverviewLayout
      actionsTitle="Go to work"
      cards={cards}
      description="Pulse across review, drafts, calendar, and live posts — not a raw post grid."
      header={
        <div className="space-y-6">
          <KPISection
            gridCols={{ desktop: 4, mobile: 2, tablet: 2 }}
            isLoading={isMetricsLoading}
            items={kpiItems}
            title="Publish pulse"
          />
          <Card
            bodyClassName="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"
            variant={CardVariant.DEFAULT}
          >
            <div className="space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                Pipeline
              </p>
              <p className="text-sm text-foreground/80">
                {reviewPulse.activeBatches > 0
                  ? `${reviewPulse.activeBatches} open batch${reviewPulse.activeBatches === 1 ? '' : 'es'}`
                  : 'No open batches'}
                {reviewPulse.pending > 0
                  ? ` · ${reviewPulse.pending} still generating`
                  : ''}
                {reviewPulse.ready > 0
                  ? ` · ${reviewPulse.ready} need a decision`
                  : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                asChild
                className="gap-1.5"
                size={ButtonSize.SM}
                variant={ButtonVariant.DEFAULT}
                withWrapper={false}
              >
                <Link href={href(APP_ROUTES.PUBLISH.REVIEW)}>
                  Review queue
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
              <Button
                asChild
                className="gap-1.5"
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
                withWrapper={false}
              >
                <Link href={href(APP_ROUTES.PUBLISH.SCHEDULED)}>
                  All drafts
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </div>
          </Card>
        </div>
      }
      icon={LayoutDashboard}
      label="Publish"
    >
      <section className="max-w-6xl space-y-3">
        <div className="space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-foreground/35">
            What this home is for
          </p>
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-foreground">
            Command center, not the post library
          </h2>
          <p
            className={cn('max-w-2xl text-sm leading-6 text-muted-foreground')}
          >
            Use Review to approve generated work, Scheduled for drafts still in
            motion, Calendar for timing, and Published for live posts. Deep
            performance charts live in the Analytics app when you need them.
          </p>
        </div>
      </section>
    </OverviewLayout>
  );
}
