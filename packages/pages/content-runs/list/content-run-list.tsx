'use client';

import { useBrandId } from '@contexts/user/brand-context/brand-context';
import { APP_ROUTES } from '@genfeedai/constants';
import {
  AlertCategory,
  ButtonVariant,
  ContentRunStatus,
} from '@genfeedai/enums';
import type { ContentRunBrief } from '@genfeedai/interfaces';
import { getRelativeTime } from '@helpers/formatting/date/date.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { ContentRunRecord } from '@services/content/content-runs.service';
import { ContentRunsService } from '@services/content/content-runs.service';
import { useQuery } from '@tanstack/react-query';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import Alert from '@ui/feedback/alert/Alert';
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
  const brandId = useBrandId();
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
    enabled: Boolean(brandId),
    initialData: EMPTY_RUNS,
    queryFn: async () => {
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
        subtitle="Briefs handed off from Discover, tracked through remix, publish, and analytics."
        actions={
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="min-w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_STATUSES}>All statuses</SelectItem>
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
        {isError ? (
          <div className="mt-6">
            <Alert type={AlertCategory.ERROR}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>Content runs could not be loaded.</span>
                <Button
                  label="Retry"
                  onClick={() => {
                    refetch().catch(() => undefined);
                  }}
                  variant={ButtonVariant.SECONDARY}
                />
              </div>
            </Alert>
          </div>
        ) : null}

        {isInitialFetch ? (
          <div className="mt-6 min-h-64">
            <LoadingState isFullSize />
          </div>
        ) : null}

        {!isError && !isInitialFetch ? (
          <div className="mt-6">
            {data.length ? (
              <Card bodyClassName="p-0">
                <div className="divide-y divide-border">
                  {data.map((run) => (
                    <ContentRunRow
                      key={getRunId(run)}
                      detailHref={href(
                        `${APP_ROUTES.AUTOMATE.CONTENT_RUNS}/${getRunId(run)}`,
                      )}
                      run={run}
                    />
                  ))}
                </div>
              </Card>
            ) : (
              <Card bodyClassName="p-10">
                <div className="mx-auto flex max-w-md flex-col items-center text-center">
                  <div className="flex size-11 items-center justify-center rounded-full border border-border bg-background-secondary text-foreground/60">
                    <Sparkles className="size-5" />
                  </div>
                  <div className="mt-4 text-base font-semibold text-foreground">
                    No content runs yet
                  </div>
                  <div className="mt-2 text-sm leading-6 text-foreground/68">
                    Save a brief from Discover to start a content run. It will
                    appear here with its variants, publish events, and
                    analytics.
                  </div>
                  <Button
                    className="mt-5"
                    asChild
                    label="Go to Discover"
                    variant={ButtonVariant.SECONDARY}
                  >
                    <Link href={href(APP_ROUTES.DISCOVER.ROOT)}>
                      Go to Discover
                    </Link>
                  </Button>
                </div>
              </Card>
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
