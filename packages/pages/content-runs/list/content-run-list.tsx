'use client';

import { ButtonVariant, ContentRunStatus } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { ContentRunBrief } from '@genfeedai/contracts/interfaces';
import { getRelativeTime } from '@helpers/formatting/date/date.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  isBrandResourceReady,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { ContentRunRecord } from '@services/content/content-runs.service';
import { ContentRunsService } from '@services/content/content-runs.service';
import { useQuery } from '@tanstack/react-query';
import Card from '@ui/card/Card';
import CardEmpty from '@ui/card/empty/CardEmpty';
import Badge from '@ui/display/badge/Badge';
import { ErrorFallback } from '@ui/error/ErrorFallback';
import LoadingState from '@ui/feedback/LoadingState';
import Container from '@ui/layout/container/Container';
import SectionTopbar from '@ui/layout/section-topbar/SectionTopbar';
import { Button } from '@ui/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { CirclePlay, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

const ALL_STATUSES = 'all';

const STATUS_OPTIONS = [
  { label: 'Pending', value: ContentRunStatus.PENDING },
  { label: 'Running', value: ContentRunStatus.RUNNING },
  { label: 'Completed', value: ContentRunStatus.COMPLETED },
  { label: 'Failed', value: ContentRunStatus.FAILED },
];

const EMPTY_RUNS: ContentRunRecord[] = [];

function getRunId(run: ContentRunRecord): string {
  return run.id;
}

function getRunTitle(brief?: ContentRunBrief): string {
  return brief?.angle ?? brief?.hypothesis ?? brief?.sourceId ?? 'Untitled run';
}

function getVariantCount(run: ContentRunRecord): number {
  return run.variants?.length ?? 0;
}

function getPublishCount(run: ContentRunRecord): number {
  if (!run.publish) {
    return 0;
  }

  return Array.isArray(run.publish) ? run.publish.length : 1;
}

export default function ContentRunListPage() {
  const translate = useTranslations('common.automation.contentRuns');
  const collectionScope = useCollectionScope();
  const { brandId, pageScope } = collectionScope;
  const isBrandReady = isBrandResourceReady(collectionScope);
  const { href } = useOrgUrl();
  const [status, setStatus] = useState<string>(ALL_STATUSES);
  const getContentRunsService = useAuthedService((token: string) =>
    ContentRunsService.getInstance(token),
  );

  const {
    data = EMPTY_RUNS,
    isError,
    isFetching,
    refetch,
  } = useQuery<ContentRunRecord[]>({
    enabled: isBrandReady,
    initialData: EMPTY_RUNS,
    queryFn: async () => {
      if (!brandId) {
        return EMPTY_RUNS;
      }
      const service = await getContentRunsService();
      return service.list(brandId, {
        status:
          status === ALL_STATUSES ? undefined : (status as ContentRunStatus),
      });
    },
    queryKey: ['content-runs', brandId, status],
  });

  const isInitialFetch = isFetching && data.length === 0;

  return (
    <>
      <SectionTopbar
        icon={CirclePlay}
        title="Content Runs"
        subtitle="Briefs handed off from Discovery, tracked through remix, publish, and analytics."
        actions={
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger
              aria-label={translate('statusFilter')}
              className="min-w-36"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_STATUSES}>
                {translate('allStatuses')}
              </SelectItem>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <Container>
        {pageScope === 'org' && !isBrandReady ? (
          <p className="mt-6 text-sm text-muted-foreground">
            {translate('selectBrand')}
          </p>
        ) : null}
        {isError ? (
          <ErrorFallback
            compact={data.length > 0}
            title={translate('loadError')}
            resetErrorBoundary={() => refetch()}
          />
        ) : null}

        {isInitialFetch ? (
          <div className="min-h-64">
            <LoadingState isFullSize />
          </div>
        ) : null}

        {(!isError || data.length > 0) && !isInitialFetch && isBrandReady ? (
          <div className="space-y-4">
            {data.length ? (
              <Card bodyClassName="p-0">
                <div className="divide-y divide-border">
                  {data.map((run) => (
                    <ContentRunRow
                      key={getRunId(run)}
                      detailHref={href(
                        `${APP_ROUTES.AUTOMATION.CONTENT_RUNS}/${getRunId(run)}`,
                      )}
                      run={run}
                    />
                  ))}
                </div>
              </Card>
            ) : (
              <CardEmpty
                icon={Sparkles}
                label={
                  status === ALL_STATUSES
                    ? translate('emptyTitle')
                    : translate('emptyFilteredTitle')
                }
                description={
                  status === ALL_STATUSES
                    ? translate('emptyDescription')
                    : undefined
                }
                action={
                  status !== ALL_STATUSES
                    ? {
                        label: translate('clearFilter'),
                        onClick: () => setStatus(ALL_STATUSES),
                      }
                    : undefined
                }
                actions={
                  status === ALL_STATUSES ? (
                    <Button
                      asChild
                      variant={ButtonVariant.SECONDARY}
                      withWrapper={false}
                    >
                      <Link href={href(APP_ROUTES.DISCOVERY.ROOT)}>
                        {translate('goToDiscovery')}
                      </Link>
                    </Button>
                  ) : undefined
                }
              />
            )}
          </div>
        ) : null}
      </Container>
    </>
  );
}

function ContentRunRow({
  detailHref,
  run,
}: {
  detailHref: string;
  run: ContentRunRecord;
}) {
  const variantCount = getVariantCount(run);
  const publishCount = getPublishCount(run);

  return (
    <Link
      className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-accent"
      href={detailHref}
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-foreground">
          {getRunTitle(run.brief)}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground/55">
          <span>{run.skillSlug ?? 'content-run'}</span>
          <span>
            {variantCount} {variantCount === 1 ? 'variant' : 'variants'}
          </span>
          <span>
            {publishCount} {publishCount === 1 ? 'publish' : 'publishes'}
          </span>
          {run.createdAt ? <span>{getRelativeTime(run.createdAt)}</span> : null}
        </div>
      </div>
      <Badge status={run.status ?? ContentRunStatus.PENDING} />
    </Link>
  );
}
