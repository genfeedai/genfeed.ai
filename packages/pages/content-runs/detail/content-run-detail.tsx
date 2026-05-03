'use client';

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

  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function formatMetric(value: number | undefined): string {
  if (typeof value !== 'number') {
    return '-';
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 1,
    notation: value >= 1000 ? 'compact' : 'standard',
  }).format(value);
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
    return 'border-emerald-400/35 bg-emerald-400/[0.08] text-emerald-100';
  }

  if (state === 'current') {
    return 'border-sky-400/35 bg-sky-400/[0.08] text-sky-100';
  }

  if (state === 'error') {
    return 'border-red-400/35 bg-red-400/[0.08] text-red-100';
  }

  return 'border-white/10 bg-white/[0.03] text-foreground/65';
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
    <section className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/[0.05] text-foreground/75">
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
    <div className="rounded-md border border-dashed border-white/10 bg-black/10 px-4 py-6 text-sm text-foreground/55">
      {label}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-white/8 border-t py-3 first:border-t-0">
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
            <div
              key={item}
              className="rounded-md border border-white/8 bg-black/10 px-3 py-2 text-sm text-foreground/75"
            >
              {item}
            </div>
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
        <article
          key={variant.id}
          className="rounded-md border border-white/8 bg-black/10 p-4"
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] uppercase text-foreground/60">
              {variant.format ?? variant.type}
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] uppercase text-foreground/60">
              {variant.platform}
            </span>
            {variant.status ? (
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] uppercase text-foreground/60">
                {variant.status}
              </span>
            ) : null}
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
        </article>
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
        <article
          key={`${context.variantId ?? context.platform ?? 'publish'}-${index}`}
          className="rounded-md border border-white/8 bg-black/10 p-4"
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
        </article>
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
      <div className="rounded-md border border-white/8 bg-black/10 p-4">
        <div className="text-xs text-foreground/50">Impressions</div>
        <div className="mt-2 text-xl font-semibold">
          {formatMetric(analytics.impressions)}
        </div>
      </div>
      <div className="rounded-md border border-white/8 bg-black/10 p-4">
        <div className="text-xs text-foreground/50">Engagements</div>
        <div className="mt-2 text-xl font-semibold">
          {formatMetric(analytics.engagements)}
        </div>
      </div>
      <div className="rounded-md border border-white/8 bg-black/10 p-4">
        <div className="text-xs text-foreground/50">Engagement rate</div>
        <div className="mt-2 text-xl font-semibold">
          {formatPercent(analytics.engagementRate)}
        </div>
      </div>
      <div className="rounded-md border border-white/8 bg-black/10 p-4">
        <div className="text-xs text-foreground/50">Winning variant</div>
        <div className="mt-2 truncate text-sm font-medium">
          {analytics.winningVariantId ?? '-'}
        </div>
      </div>
      {analytics.summary ? (
        <p className="md:col-span-4 text-sm text-foreground/72">
          {analytics.summary}
        </p>
      ) : null}
      {analytics.topSignals?.length ? (
        <div className="grid gap-2 md:col-span-4">
          {analytics.topSignals.map((signal) => (
            <div
              key={signal}
              className="rounded-md border border-white/8 bg-black/10 px-3 py-2 text-sm text-foreground/75"
            >
              {signal}
            </div>
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
        <article
          key={`${recommendation.type}-${index}`}
          className="rounded-md border border-white/8 bg-black/10 p-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] uppercase text-foreground/60">
              {recommendation.type}
            </span>
            {typeof recommendation.confidence === 'number' ? (
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] uppercase text-foreground/60">
                {formatPercent(recommendation.confidence * 100)}
              </span>
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
        </article>
      ))}
    </div>
  );
}

function TimelinePanel({ run }: { run: ContentRunRecord }) {
  const steps = useMemo(() => getTimelineSteps(run), [run]);

  return (
    <aside className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
      <h2 className="text-sm font-semibold">Lifecycle</h2>
      <div className="mt-4 space-y-3">
        {steps.map((step) => (
          <div
            key={step.key}
            className={`rounded-md border px-3 py-3 ${getStepClasses(step.state)}`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">{step.label}</span>
              {step.state === 'complete' ? (
                <HiCheckCircle className="h-4 w-4" />
              ) : step.state === 'error' ? (
                <HiExclamationTriangle className="h-4 w-4" />
              ) : (
                <HiClock className="h-4 w-4" />
              )}
            </div>
            <p className="mt-1 text-xs opacity-75">{step.description}</p>
          </div>
        ))}
      </div>
    </aside>
  );
}

function NavigationPanel() {
  const { href } = useOrgUrl();
  const links = [
    { href: href('/posts/remix'), label: 'Remix', icon: HiSparkles },
    { href: href('/posts'), label: 'Publish', icon: HiPaperAirplane },
    { href: href('/analytics/posts'), label: 'Analytics', icon: HiChartBar },
  ];

  return (
    <aside className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
      <h2 className="text-sm font-semibold">Open Subviews</h2>
      <div className="mt-4 grid gap-2">
        {links.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex min-h-11 items-center justify-between rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm text-foreground/82 transition hover:border-white/18 hover:bg-white/[0.07]"
            >
              <span className="flex items-center gap-2">
                <Icon className="h-4 w-4" />
                {item.label}
              </span>
              <span aria-hidden="true">&gt;</span>
            </Link>
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

  if (state === 'loading' || state === 'idle') {
    return (
      <Container>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-8 text-sm text-foreground/60">
          Loading content run...
        </div>
      </Container>
    );
  }

  if (state === 'error' || !run) {
    return (
      <Container>
        <div className="rounded-lg border border-red-400/25 bg-red-400/[0.08] p-8 text-sm text-red-100">
          Content run could not be loaded.
        </div>
      </Container>
    );
  }

  return (
    <Container>
      <div className="flex flex-col gap-6">
        <header className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] uppercase text-foreground/60">
              {run.status ?? 'unknown'}
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] uppercase text-foreground/60">
              {run.skillSlug ?? 'content-run'}
            </span>
            {run.source ? (
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] uppercase text-foreground/60">
                {run.source}
              </span>
            ) : null}
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
              icon={<HiDocumentText className="h-4 w-4" />}
            >
              <BriefSection brief={run.brief} />
            </Section>

            <Section
              title="Remix Variants"
              icon={<HiSparkles className="h-4 w-4" />}
            >
              <VariantsSection variants={run.variants} />
            </Section>

            <Section
              title="Publish Events"
              icon={<HiPaperAirplane className="h-4 w-4" />}
            >
              <PublishSection publish={run.publish} />
            </Section>

            <Section
              title="Analytics Summary"
              icon={<HiChartBar className="h-4 w-4" />}
            >
              <AnalyticsSection analytics={run.analyticsSummary} />
            </Section>

            <Section
              title="Recommended Next Actions"
              icon={<HiArrowPath className="h-4 w-4" />}
            >
              <RecommendationsSection recommendations={run.recommendations} />
            </Section>
          </main>

          <div className="grid content-start gap-5">
            <TimelinePanel run={run} />
            <NavigationPanel />
          </div>
        </div>
      </div>
    </Container>
  );
}
