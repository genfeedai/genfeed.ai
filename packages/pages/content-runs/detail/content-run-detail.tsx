'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type {
  ContentRunAnalyticsSummary,
  ContentRunBrief,
  ContentRunPublishContext,
  ContentRunRecommendation,
  ContentRunVariant,
} from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { ContentRunRecord } from '@services/content/content-runs.service';
import { ContentRunsService } from '@services/content/content-runs.service';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  HiArrowPath,
  HiChartBar,
  HiCheckCircle,
  HiClock,
  HiDocumentText,
  HiExclamationTriangle,
  HiPaperAirplane,
  HiSparkles,
} from 'react-icons/hi2';

export interface ContentRunDetailPageProps {
  runId: string;
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

type TimelineStep = {
  description: string;
  key: string;
  label: string;
  state: 'complete' | 'current' | 'pending' | 'error';
};

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  month: 'short',
  year: 'numeric',
});

const METRIC_FORMATTER_COMPACT = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
  notation: 'compact',
});

const METRIC_FORMATTER_STANDARD = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
  notation: 'standard',
});

function getRunId(run: ContentRunRecord): string {
  return run.id ?? run._id ?? '';
}

function formatDateTime(value?: Date | string): string {
  if (!value) {
    return 'Not set';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return DATE_TIME_FORMATTER.format(date);
}

function formatMetric(value: number | undefined): string {
  if (typeof value !== 'number') {
    return '-';
  }

  return (
    value >= 1000 ? METRIC_FORMATTER_COMPACT : METRIC_FORMATTER_STANDARD
  ).format(value);
}

function formatPercent(value: number | undefined): string {
  if (typeof value !== 'number') {
    return '-';
  }

  return `${value.toFixed(2)}%`;
}

function getBriefTitle(brief?: ContentRunBrief): string {
  return brief?.angle ?? brief?.hypothesis ?? brief?.sourceId ?? 'Untitled run';
}

function normalizePublishContexts(
  publish?: ContentRunRecord['publish'],
): ContentRunPublishContext[] {
  if (!publish) {
    return [];
  }

  return Array.isArray(publish) ? publish : [publish];
}

function getTimelineSteps(run: ContentRunRecord): TimelineStep[] {
  const hasBrief = Boolean(run.brief);
  const hasVariants = Boolean(run.variants?.length);
  const hasPublish = Boolean(normalizePublishContexts(run.publish).length);
  const hasAnalytics = Boolean(run.analyticsSummary);
  const hasRecommendations = Boolean(run.recommendations?.length);
  const hasError = Boolean(run.error);

  return [
    {
      description: hasBrief ? 'Captured' : 'Waiting',
      key: 'brief',
      label: 'Brief',
      state: hasBrief ? 'complete' : 'pending',
    },
    {
      description: hasVariants
        ? `${run.variants?.length ?? 0} variants`
        : 'Queued',
      key: 'variants',
      label: 'Remix',
      state: hasVariants ? 'complete' : hasBrief ? 'current' : 'pending',
    },
    {
      description: hasPublish ? 'Publish context saved' : 'Not published',
      key: 'publish',
      label: 'Publish',
      state: hasPublish ? 'complete' : hasVariants ? 'current' : 'pending',
    },
    {
      description: hasAnalytics ? 'Performance attached' : 'No sync yet',
      key: 'analytics',
      label: 'Analytics',
      state: hasAnalytics ? 'complete' : hasPublish ? 'current' : 'pending',
    },
    {
      description: hasError
        ? 'Needs review'
        : hasRecommendations
          ? `${run.recommendations?.length ?? 0} actions`
          : 'Pending',
      key: 'actions',
      label: 'Next',
      state: hasError ? 'error' : hasRecommendations ? 'complete' : 'pending',
    },
  ];
}

function getStepClasses(state: TimelineStep['state']): string {
  if (state === 'complete') {
    return 'bg-success/10 text-success shadow-border';
  }

  if (state === 'current') {
    return 'bg-info/10 text-info shadow-border';
  }

  if (state === 'error') {
    return 'bg-destructive/10 text-destructive shadow-border';
  }

  return 'bg-secondary text-foreground/65 shadow-border';
}

function Panel({
  as: Tag = 'div',
  children,
  className,
}: {
  as?: 'div' | 'article';
  children: ReactNode;
  className?: string;
}) {
  return (
    <Tag className={`rounded-md bg-secondary shadow-border ${className ?? ''}`}>
      {children}
    </Tag>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-secondary px-2 py-1 text-[11px] uppercase text-foreground/60 shadow-border">
      {children}
    </span>
  );
}

function Section({
  children,
  icon,
  title,
}: {
  children: ReactNode;
  icon: ReactNode;
  title: string;
}) {
  return (
    <section className="rounded-lg bg-secondary p-5 shadow-border">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-md bg-card text-foreground/75 shadow-border">
          {icon}
        </span>
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-dashed border-border px-4 py-6 text-sm text-foreground/55">
      {label}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-border border-t py-3 first:border-t-0">
      <dt className="text-xs text-foreground/50">{label}</dt>
      <dd className="max-w-[70%] text-right text-sm text-foreground/82">
        {value ?? '-'}
      </dd>
    </div>
  );
}

function BriefSection({ brief }: { brief?: ContentRunBrief }) {
  if (!brief) {
    return <EmptyState label="No brief has been attached to this run." />;
  }

  return (
    <div className="space-y-4">
      <dl>
        <DetailRow label="Angle" value={brief.angle} />
        <DetailRow label="Audience" value={brief.audience} />
        <DetailRow label="Hypothesis" value={brief.hypothesis} />
        <DetailRow label="Channel fit" value={brief.channelFit} />
        <DetailRow label="Risk" value={brief.risk} />
        <DetailRow
          label="Confidence"
          value={
            typeof brief.confidence === 'number'
              ? formatPercent(brief.confidence * 100)
              : undefined
          }
        />
      </dl>
      {brief.evidence?.length ? (
        <div className="grid gap-2">
          {brief.evidence.map((item) => (
            <Panel key={item} className="px-3 py-2 text-sm text-foreground/75">
              {item}
            </Panel>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function VariantsSection({ variants }: { variants?: ContentRunVariant[] }) {
  if (!variants?.length) {
    return <EmptyState label="No remix variants have been stored yet." />;
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {variants.map((variant) => (
        <Panel as="article" key={variant.id} className="p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Pill>{variant.format ?? variant.type}</Pill>
            <Pill>{variant.platform}</Pill>
            {variant.status ? <Pill>{variant.status}</Pill> : null}
          </div>
          <h3 className="text-sm font-medium">{variant.angle ?? variant.id}</h3>
          {variant.hypothesis ? (
            <p className="mt-2 text-sm text-foreground/62">
              {variant.hypothesis}
            </p>
          ) : null}
          {variant.content ? (
            <p className="mt-3 line-clamp-4 text-sm text-foreground/76">
              {variant.content}
            </p>
          ) : null}
        </Panel>
      ))}
    </div>
  );
}

function PublishSection({
  publish,
}: {
  publish?: ContentRunRecord['publish'];
}) {
  const contexts = normalizePublishContexts(publish);

  if (contexts.length === 0) {
    return <EmptyState label="No publish context has been captured yet." />;
  }

  return (
    <div className="grid gap-3">
      {contexts.map((context, index) => (
        <Panel
          as="article"
          key={`${context.variantId ?? context.platform ?? 'publish'}-${index}`}
          className="p-4"
        >
          <dl>
            <DetailRow label="Platform" value={context.platform} />
            <DetailRow label="Channel" value={context.channel} />
            <DetailRow label="Variant" value={context.variantId} />
            <DetailRow label="Experiment" value={context.experimentId} />
            <DetailRow
              label="Scheduled"
              value={formatDateTime(context.scheduledFor)}
            />
            <DetailRow
              label="Published"
              value={formatDateTime(context.publishedAt)}
            />
            <DetailRow
              label="Posts"
              value={context.postIds?.length ? context.postIds.join(', ') : '-'}
            />
          </dl>
        </Panel>
      ))}
    </div>
  );
}

function AnalyticsSection({
  analytics,
}: {
  analytics?: ContentRunAnalyticsSummary;
}) {
  if (!analytics) {
    return <EmptyState label="No analytics summary has been synced yet." />;
  }

  return (
    <div className="grid gap-3 md:grid-cols-4">
      <Panel className="p-4">
        <div className="text-xs text-foreground/50">Impressions</div>
        <div className="mt-2 text-xl font-semibold">
          {formatMetric(analytics.impressions)}
        </div>
      </Panel>
      <Panel className="p-4">
        <div className="text-xs text-foreground/50">Engagements</div>
        <div className="mt-2 text-xl font-semibold">
          {formatMetric(analytics.engagements)}
        </div>
      </Panel>
      <Panel className="p-4">
        <div className="text-xs text-foreground/50">Engagement rate</div>
        <div className="mt-2 text-xl font-semibold">
          {formatPercent(analytics.engagementRate)}
        </div>
      </Panel>
      <Panel className="p-4">
        <div className="text-xs text-foreground/50">Winning variant</div>
        <div className="mt-2 truncate text-sm font-medium">
          {analytics.winningVariantId ?? '-'}
        </div>
      </Panel>
      {analytics.summary ? (
        <p className="md:col-span-4 text-sm text-foreground/72">
          {analytics.summary}
        </p>
      ) : null}
      {analytics.topSignals?.length ? (
        <div className="grid gap-2 md:col-span-4">
          {analytics.topSignals.map((signal) => (
            <Panel
              key={signal}
              className="px-3 py-2 text-sm text-foreground/75"
            >
              {signal}
            </Panel>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function RecommendationsSection({
  recommendations,
}: {
  recommendations?: ContentRunRecommendation[];
}) {
  if (!recommendations?.length) {
    return (
      <EmptyState label="No recommended actions have been generated yet." />
    );
  }

  return (
    <div className="grid gap-3">
      {recommendations.map((recommendation, index) => (
        <Panel
          as="article"
          key={`${recommendation.type}-${index}`}
          className="p-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Pill>{recommendation.type}</Pill>
            {typeof recommendation.confidence === 'number' ? (
              <Pill>{formatPercent(recommendation.confidence * 100)}</Pill>
            ) : null}
          </div>
          <h3 className="mt-3 text-sm font-medium">
            {recommendation.action ?? 'Review recommendation'}
          </h3>
          {recommendation.rationale ? (
            <p className="mt-2 text-sm text-foreground/65">
              {recommendation.rationale}
            </p>
          ) : null}
        </Panel>
      ))}
    </div>
  );
}

function TimelinePanel({ run }: { run: ContentRunRecord }) {
  const steps = useMemo(() => getTimelineSteps(run), [run]);

  return (
    <aside className="rounded-lg bg-secondary p-5 shadow-border">
      <h2 className="text-sm font-semibold">Lifecycle</h2>
      <div className="mt-4 space-y-3">
        {steps.map((step) => (
          <div
            key={step.key}
            className={`rounded-md px-3 py-3 ${getStepClasses(step.state)}`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">{step.label}</span>
              {step.state === 'complete' ? (
                <HiCheckCircle className="size-4" />
              ) : step.state === 'error' ? (
                <HiExclamationTriangle className="size-4" />
              ) : (
                <HiClock className="size-4" />
              )}
            </div>
            <p className="mt-1 text-xs opacity-75">{step.description}</p>
          </div>
        ))}
      </div>
    </aside>
  );
}

function NavigationPanel({
  isRemixing,
  onCreateRemixPack,
}: {
  isRemixing: boolean;
  onCreateRemixPack: () => void;
}) {
  const { href } = useOrgUrl();
  const links = [
    { href: href('/posts'), label: 'Publish', icon: HiPaperAirplane },
    { href: href('/analytics/posts'), label: 'Analytics', icon: HiChartBar },
  ];

  return (
    <aside className="rounded-lg bg-secondary p-5 shadow-border">
      <h2 className="text-sm font-semibold">Actions and Views</h2>
      <div className="mt-4 grid gap-2">
        <Button
          ariaLabel="Create remix pack from this content run"
          className="flex min-h-11 items-center justify-between rounded-md bg-card px-3 text-sm text-foreground/82 shadow-border transition hover:bg-accent"
          isLoading={isRemixing}
          onClick={onCreateRemixPack}
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
        >
          <span className="flex items-center gap-2">
            <HiSparkles className="size-4" />
            Create Remix Pack
          </span>
        </Button>
        {links.map((item) => {
          const Icon = item.icon;
          return (
            <Button
              asChild
              key={item.href}
              className="flex min-h-11 items-center justify-between rounded-md bg-card px-3 text-sm text-foreground/82 shadow-border transition hover:bg-accent"
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
            >
              <Link href={item.href}>
                <span className="flex items-center gap-2">
                  <Icon className="size-4" />
                  {item.label}
                </span>
                <span aria-hidden="true">&gt;</span>
              </Link>
            </Button>
          );
        })}
      </div>
    </aside>
  );
}

export default function ContentRunDetailPage({
  runId,
}: ContentRunDetailPageProps) {
  const [run, setRun] = useState<ContentRunRecord | null>(null);
  const [isRemixing, setIsRemixing] = useState(false);
  const [remixError, setRemixError] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>('idle');
  const getContentRunsService = useAuthedService((token: string) =>
    ContentRunsService.getInstance(token),
  );

  useEffect(() => {
    let isMounted = true;

    async function loadRun() {
      setState('loading');
      try {
        const service = await getContentRunsService();
        const data = await service.findOne(runId);
        if (isMounted) {
          setRun(data);
          setState('ready');
        }
      } catch {
        if (isMounted) {
          setState('error');
        }
      }
    }

    loadRun();

    return () => {
      isMounted = false;
    };
  }, [getContentRunsService, runId]);

  const handleCreateRemixPack = async () => {
    setIsRemixing(true);
    setRemixError(null);

    try {
      const service = await getContentRunsService();
      setRun(await service.createRemixPack(runId));
    } catch {
      setRemixError('Remix pack could not be created.');
    } finally {
      setIsRemixing(false);
    }
  };

  if (state === 'loading' || state === 'idle') {
    return (
      <Container>
        <div className="rounded-lg bg-secondary p-8 text-sm text-foreground/60 shadow-border">
          Loading content run…
        </div>
      </Container>
    );
  }

  if (state === 'error' || !run) {
    return (
      <Container>
        <div className="rounded-lg bg-destructive/10 p-8 text-sm text-destructive shadow-border">
          Content run could not be loaded.
        </div>
      </Container>
    );
  }

  return (
    <Container>
      <div className="flex flex-col gap-6">
        <header className="rounded-lg bg-secondary p-5 shadow-border">
          <div className="flex flex-wrap items-center gap-2">
            <Pill>{run.status ?? 'unknown'}</Pill>
            <Pill>{run.skillSlug ?? 'content-run'}</Pill>
            {run.source ? <Pill>{run.source}</Pill> : null}
          </div>
          <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-2xl font-semibold">
                {getBriefTitle(run.brief)}
              </h1>
              <p className="mt-2 text-sm text-foreground/56">{getRunId(run)}</p>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-foreground/48">Created</dt>
                <dd className="mt-1 text-foreground/80">
                  {formatDateTime(run.createdAt)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-foreground/48">Credits</dt>
                <dd className="mt-1 text-foreground/80">
                  {formatMetric(run.creditsUsed)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-foreground/48">Duration</dt>
                <dd className="mt-1 text-foreground/80">
                  {run.duration ? `${run.duration}ms` : '-'}
                </dd>
              </div>
            </dl>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <main className="grid gap-5">
            <Section
              title="Source Brief"
              icon={<HiDocumentText className="size-4" />}
            >
              <BriefSection brief={run.brief} />
            </Section>

            <Section
              title="Remix Variants"
              icon={<HiSparkles className="size-4" />}
            >
              <VariantsSection variants={run.variants} />
            </Section>

            <Section
              title="Publish Events"
              icon={<HiPaperAirplane className="size-4" />}
            >
              <PublishSection publish={run.publish} />
            </Section>

            <Section
              title="Analytics Summary"
              icon={<HiChartBar className="size-4" />}
            >
              <AnalyticsSection analytics={run.analyticsSummary} />
            </Section>

            <Section
              title="Recommended Next Actions"
              icon={<HiArrowPath className="size-4" />}
            >
              <RecommendationsSection recommendations={run.recommendations} />
            </Section>
          </main>

          <div className="grid content-start gap-5">
            <TimelinePanel run={run} />
            {remixError ? (
              <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive shadow-border">
                {remixError}
              </div>
            ) : null}
            <NavigationPanel
              isRemixing={isRemixing}
              onCreateRemixPack={handleCreateRemixPack}
            />
          </div>
        </div>
      </div>
    </Container>
  );
}
