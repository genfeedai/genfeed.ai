'use client';

import { AgentType, ButtonSize, ButtonVariant } from '@genfeedai/enums';
import {
  DefinitionDetail,
  DefinitionList,
  DefinitionTerm,
} from '@genfeedai/ui';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useAgentRuns } from '@hooks/data/agent-runs/use-agent-runs';
import { useAgentStrategy } from '@hooks/data/agent-strategies/use-agent-strategy';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import type {
  AgentDetailPageProps,
  AgentRunRowProps,
} from '@props/automation/agent-strategy.props';
import {
  AgentStrategiesService,
  type AgentStrategyOpportunity,
} from '@services/automation/agent-strategies.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Badge from '@ui/display/badge/Badge';
import InsetSurface from '@ui/display/inset-surface/InsetSurface';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ui/primitives/table';
import { formatDistanceToNow } from 'date-fns';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { FaLinkedin, FaXTwitter, FaYoutube } from 'react-icons/fa6';
import {
  HiArrowLeft,
  HiChevronDown,
  HiChevronRight,
  HiOutlineBolt,
  HiOutlineCpuChip,
  HiOutlineDocumentText,
  HiOutlineMegaphone,
  HiOutlinePhoto,
  HiOutlinePlayCircle,
  HiOutlineSparkles,
  HiOutlineUser,
  HiOutlineVideoCamera,
} from 'react-icons/hi2';

const AgentRunContentGrid = dynamic(() => import('./AgentRunContentGrid'), {
  ssr: false,
});

const AGENT_TYPE_LABELS: Record<AgentType, string> = {
  [AgentType.GENERAL]: 'General',
  [AgentType.X_CONTENT]: 'X Content',
  [AgentType.IMAGE_CREATOR]: 'Image Creator',
  [AgentType.VIDEO_CREATOR]: 'Video Creator',
  [AgentType.AI_AVATAR]: 'AI Avatar',
  [AgentType.ARTICLE_WRITER]: 'Article Writer',
  [AgentType.LINKEDIN_CONTENT]: 'LinkedIn Copywriter',
  [AgentType.ADS_SCRIPT_WRITER]: 'Ads Script Writer',
  [AgentType.SHORT_FORM_WRITER]: 'Short-Form Writer',
  [AgentType.CTA_CONTENT]: 'CTA / Conversion',
  [AgentType.YOUTUBE_SCRIPT]: 'YouTube Script',
};

const AGENT_TYPE_ICONS: Record<AgentType, React.ReactNode> = {
  [AgentType.GENERAL]: <HiOutlineCpuChip className="size-5" />,
  [AgentType.X_CONTENT]: <FaXTwitter className="size-4" />,
  [AgentType.IMAGE_CREATOR]: <HiOutlinePhoto className="size-5" />,
  [AgentType.VIDEO_CREATOR]: <HiOutlineVideoCamera className="size-5" />,
  [AgentType.AI_AVATAR]: <HiOutlineUser className="size-5" />,
  [AgentType.ARTICLE_WRITER]: <HiOutlineDocumentText className="size-5" />,
  [AgentType.LINKEDIN_CONTENT]: <FaLinkedin className="size-4" />,
  [AgentType.ADS_SCRIPT_WRITER]: <HiOutlineMegaphone className="size-5" />,
  [AgentType.SHORT_FORM_WRITER]: <HiOutlineBolt className="size-5" />,
  [AgentType.CTA_CONTENT]: <HiOutlineSparkles className="size-5" />,
  [AgentType.YOUTUBE_SCRIPT]: <FaYoutube className="size-4" />,
};

const RUN_STATUS_VARIANTS: Record<
  string,
  'success' | 'warning' | 'error' | 'secondary'
> = {
  budget_exhausted: 'warning',
  completed: 'success',
  failed: 'error',
  pending: 'secondary',
  running: 'warning',
};

function getRunMetadataString(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : undefined;
}

function getRunModelLabel(run: AgentRunRowProps['run']): string {
  const actualModel = getRunMetadataString(run.metadata, 'actualModel');
  const requestedModel = getRunMetadataString(run.metadata, 'requestedModel');

  if (actualModel && requestedModel && actualModel !== requestedModel) {
    return `${actualModel} via ${requestedModel}`;
  }

  return actualModel ?? requestedModel ?? 'Untracked';
}

export default function AgentDetailPage({ agentId }: AgentDetailPageProps) {
  const notificationsService = NotificationsService.getInstance();
  const searchParams = useSearchParams();
  const requestedOpportunityId = searchParams.get('opportunity');
  const {
    strategy,
    isLoading: isStrategyLoading,
    refresh,
  } = useAgentStrategy(agentId);
  const { runs, isLoading: isRunsLoading } = useAgentRuns({
    strategy: agentId,
  });

  const getService = useAuthedService((token: string) =>
    AgentStrategiesService.getInstance(token),
  );
  const { data: opportunities, isLoading: isOpportunitiesLoading } =
    useResource<AgentStrategyOpportunity[]>(
      async () => {
        const service = await getService();
        return service.listOpportunities(agentId);
      },
      {
        defaultValue: [],
        dependencies: [agentId, requestedOpportunityId],
        enabled: Boolean(requestedOpportunityId),
      },
    );

  const handleToggle = useCallback(async () => {
    if (!strategy) return;
    try {
      const service = await getService();
      await service.toggle(agentId);
      await refresh();
      notificationsService.success('Agent status updated');
    } catch (error) {
      logger.error('Failed to toggle agent', { error });
      notificationsService.error('Failed to update agent status');
    }
  }, [agentId, getService, notificationsService, refresh, strategy]);

  const handleRunNow = useCallback(async () => {
    try {
      const service = await getService();
      await service.runNow(agentId);
      notificationsService.success('Agent run triggered');
    } catch (error) {
      logger.error('Failed to trigger run', { error });
      notificationsService.error('Failed to trigger run');
    }
  }, [agentId, getService, notificationsService]);

  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  const recentRuns = useMemo(() => runs.slice(0, 20), [runs]);
  const selectedOpportunity = useMemo(
    () =>
      requestedOpportunityId
        ? ((opportunities ?? []).find(
            (opportunity) => opportunity.id === requestedOpportunityId,
          ) ?? null)
        : null,
    [opportunities, requestedOpportunityId],
  );

  const handleToggleExpand = useCallback((runId: string) => {
    setExpandedRunId((prev) => (prev === runId ? null : runId));
  }, []);

  const agentType = strategy?.agentType as AgentType | undefined;
  const icon = agentType ? (
    (AGENT_TYPE_ICONS[agentType] ?? <HiOutlineCpuChip className="size-5" />)
  ) : (
    <HiOutlineCpuChip className="size-5" />
  );
  const typeLabel = agentType
    ? (AGENT_TYPE_LABELS[agentType] ?? strategy?.agentType)
    : '';

  if (isStrategyLoading) {
    return (
      <Container label="Agent Detail" icon={HiOutlineCpuChip}>
        <div className="h-64 animate-pulse rounded bg-foreground/5" />
      </Container>
    );
  }

  if (!strategy) {
    return (
      <Container label="Agent Detail" icon={HiOutlineCpuChip}>
        <div className="py-16 text-center text-foreground/50">
          Agent not found.{' '}
          <Link href="/orchestration" className="underline">
            Back to Agent Hub
          </Link>
        </div>
      </Container>
    );
  }

  return (
    <Container
      label={strategy.label}
      description={`${typeLabel} agent`}
      icon={HiOutlineCpuChip}
      left={
        <Link href="/orchestration">
          <Button
            label={
              <>
                <HiArrowLeft /> Agents
              </>
            }
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
          />
        </Link>
      }
      right={
        <div className="flex items-center gap-2">
          <Badge variant={strategy.isActive ? 'success' : 'secondary'}>
            {strategy.isActive ? 'Active' : 'Inactive'}
          </Badge>
          <Button
            label={strategy.isActive ? 'Deactivate' : 'Activate'}
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
            onClick={handleToggle}
          />
          <Button
            label="Run Now"
            icon={<HiOutlinePlayCircle />}
            size={ButtonSize.SM}
            variant={ButtonVariant.DEFAULT}
            onClick={handleRunNow}
          />
        </div>
      }
    >
      <div className="space-y-6">
        {/* Agent info header */}
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded bg-foreground/5 text-foreground/70">
            {icon}
          </span>
          <div>
            <p className="font-semibold">{strategy.label}</p>
            <p className="text-sm text-foreground/50">
              {typeLabel}
              {strategy.brand ? ` · ${strategy.brand}` : ''}
              {' · '}
              {strategy.autonomyMode === 'auto_publish'
                ? 'Auto-Publish'
                : 'Supervised'}
            </p>
          </div>
        </div>

        <KPISection
          title="Usage"
          gridCols={{ desktop: 4, mobile: 2, tablet: 4 }}
          items={[
            {
              description: `Budget: ${strategy.dailyCreditBudget}`,
              label: 'Credits Today',
              value: strategy.creditsUsedToday,
            },
            {
              description: `Budget: ${strategy.weeklyCreditBudget}`,
              label: 'Credits This Week',
              value: strategy.creditsUsedThisWeek,
            },
            {
              description: 'All time runs',
              label: 'Total Runs',
              value: runs.length,
            },
            {
              description: 'Consecutive errors',
              label: 'Failures',
              value: strategy.consecutiveFailures,
              valueClassName:
                strategy.consecutiveFailures > 0
                  ? 'text-destructive'
                  : 'text-success',
            },
          ]}
        />

        {requestedOpportunityId && (
          <InsetSurface className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-medium text-foreground">
                  Review context
                </h3>
                <p className="mt-1 text-sm text-foreground/55">
                  Opened from the publishing inbox with autopilot opportunity
                  context.
                </p>
              </div>
              <Badge variant="secondary">
                {selectedOpportunity?.sourceType ?? 'Loading'}
              </Badge>
            </div>

            <DefinitionList
              variant="grid"
              className="mt-4 gap-3 text-sm md:grid-cols-2"
            >
              <InsetSurface className="p-3" density="compact" tone="contrast">
                <DefinitionTerm>Opportunity</DefinitionTerm>
                <DefinitionDetail
                  variant="inline"
                  className="mt-1 text-foreground/85"
                >
                  {selectedOpportunity?.topic ??
                    (isOpportunitiesLoading
                      ? 'Loading opportunity...'
                      : requestedOpportunityId)}
                </DefinitionDetail>
              </InsetSurface>
              <InsetSurface className="p-3" density="compact" tone="contrast">
                <DefinitionTerm>Status</DefinitionTerm>
                <DefinitionDetail
                  variant="inline"
                  className="mt-1 capitalize text-foreground/85"
                >
                  {selectedOpportunity?.status ??
                    (isOpportunitiesLoading ? 'Loading' : 'Unavailable')}
                </DefinitionDetail>
              </InsetSurface>
              <InsetSurface className="p-3" density="compact" tone="contrast">
                <DefinitionTerm>Reason</DefinitionTerm>
                <DefinitionDetail
                  variant="inline"
                  className="mt-1 text-foreground/85"
                >
                  {selectedOpportunity?.decisionReason ?? 'Not recorded'}
                </DefinitionDetail>
              </InsetSurface>
              <InsetSurface className="p-3" density="compact" tone="contrast">
                <DefinitionTerm>Expected traffic</DefinitionTerm>
                <DefinitionDetail
                  variant="inline"
                  className="mt-1 text-foreground/85"
                >
                  {selectedOpportunity?.expectedTrafficScore ?? 'Not recorded'}
                </DefinitionDetail>
              </InsetSurface>
            </DefinitionList>
          </InsetSurface>
        )}

        <div>
          <h3 className="mb-3 text-sm font-medium text-foreground/70">
            Run History (last 20)
          </h3>
          {isRunsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-12 animate-pulse rounded bg-foreground/5"
                />
              ))}
            </div>
          ) : recentRuns.length === 0 ? (
            <p className="py-8 text-center text-sm text-foreground/40">
              No runs yet
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table className="w-full caption-bottom text-sm">
                <TableHeader>
                  <TableRow className="border-b border-white/5">
                    <TableHead className="h-12 w-10 px-2 text-left" />
                    <TableHead className="h-12 px-4 text-left text-[10px] font-black uppercase tracking-widest text-white/20">
                      Status
                    </TableHead>
                    <TableHead className="h-12 px-4 text-left text-[10px] font-black uppercase tracking-widest text-white/20">
                      Credits
                    </TableHead>
                    <TableHead className="h-12 px-4 text-left text-[10px] font-black uppercase tracking-widest text-white/20">
                      Model
                    </TableHead>
                    <TableHead className="h-12 px-4 text-left text-[10px] font-black uppercase tracking-widest text-white/20">
                      Duration
                    </TableHead>
                    <TableHead className="h-12 px-4 text-left text-[10px] font-black uppercase tracking-widest text-white/20">
                      Started
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentRuns.map((run) => {
                    const isExpanded = expandedRunId === run.id;
                    return (
                      <RunRow
                        key={run.id}
                        run={run}
                        isExpanded={isExpanded}
                        onToggle={handleToggleExpand}
                      />
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </Container>
  );
}

function RunRow({ run, isExpanded, onToggle }: AgentRunRowProps) {
  return (
    <>
      <TableRow
        className="cursor-pointer border-b border-white/5 transition-all duration-200 hover:bg-white/[0.02]"
        onClick={() => onToggle(run.id)}
      >
        <TableCell className="px-2 py-4 align-middle">
          {isExpanded ? (
            <HiChevronDown className="size-4 text-foreground/40" />
          ) : (
            <HiChevronRight className="size-4 text-foreground/40" />
          )}
        </TableCell>
        <TableCell className="px-4 py-4 align-middle">
          <Badge variant={RUN_STATUS_VARIANTS[run.status] ?? 'secondary'}>
            {run.status}
          </Badge>
        </TableCell>
        <TableCell className="px-4 py-4 align-middle text-sm">
          {run.creditsUsed ?? 0}
        </TableCell>
        <TableCell
          className="max-w-[18rem] px-4 py-4 align-middle text-sm text-foreground/60"
          title={getRunModelLabel(run)}
        >
          <span className="block truncate">{getRunModelLabel(run)}</span>
        </TableCell>
        <TableCell className="px-4 py-4 align-middle text-sm text-foreground/60">
          {run.durationMs ? `${Math.round(run.durationMs / 1000)}s` : '\u2014'}
        </TableCell>
        <TableCell className="px-4 py-4 align-middle text-sm text-foreground/60">
          {run.startedAt
            ? formatDistanceToNow(new Date(run.startedAt), {
                addSuffix: true,
              })
            : '\u2014'}
        </TableCell>
      </TableRow>
      {isExpanded && (
        <TableRow>
          <TableCell
            colSpan={6}
            className="border-b border-white/5 bg-foreground/[0.02]"
          >
            <div className="space-y-4 p-4">
              <div className="flex flex-wrap gap-2 text-xs text-foreground/65">
                <span className="rounded border border-white/10 bg-black/20 px-2 py-1">
                  Model: {getRunModelLabel(run)}
                </span>
                {getRunMetadataString(run.metadata, 'routingPolicy') && (
                  <span className="rounded border border-white/10 bg-black/20 px-2 py-1">
                    Routing:{' '}
                    {getRunMetadataString(run.metadata, 'routingPolicy')}
                  </span>
                )}
                {run.metadata?.webSearchEnabled === true && (
                  <span className="rounded border border-white/10 bg-black/20 px-2 py-1">
                    Web enabled
                  </span>
                )}
              </div>
              <AgentRunContentGrid runId={run.id} />
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
