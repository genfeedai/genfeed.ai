'use client';

import { AgentType, ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useAgentRuns } from '@hooks/data/agent-runs/use-agent-runs';
import { useAgentStrategy } from '@hooks/data/agent-strategies/use-agent-strategy';
import type { AgentDetailPageProps } from '@props/automation/agent-strategy.props';
import {
  AgentStrategiesService,
  type AgentStrategyOpportunity,
} from '@services/automation/agent-strategies.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQuery } from '@tanstack/react-query';
import Badge from '@ui/display/badge/Badge';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useMemo, useState } from 'react';
import { FaLinkedin, FaXTwitter, FaYoutube } from 'react-icons/fa6';
import {
  HiArrowLeft,
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
import AgentOpportunityPanel from './AgentOpportunityPanel';
import AgentRunHistorySection from './AgentRunHistorySection';

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
  [AgentType.BRAND_INTERVIEW]: 'Brand Interview',
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
  [AgentType.BRAND_INTERVIEW]: <HiOutlineSparkles className="size-5" />,
};

function AgentDetailPageContent({ agentId }: AgentDetailPageProps) {
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
  const { data: opportunities = [], isLoading: isOpportunitiesLoading } =
    useQuery<AgentStrategyOpportunity[]>({
      queryKey: ['agent-opportunities', agentId, requestedOpportunityId],
      queryFn: async () => {
        const service = await getService();
        return service.listOpportunities(agentId);
      },
      enabled: Boolean(requestedOpportunityId),
    });

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
          <AgentOpportunityPanel
            requestedOpportunityId={requestedOpportunityId}
            selectedOpportunity={selectedOpportunity}
            isOpportunitiesLoading={isOpportunitiesLoading}
          />
        )}

        <AgentRunHistorySection
          isRunsLoading={isRunsLoading}
          recentRuns={recentRuns}
          expandedRunId={expandedRunId}
          onToggleExpand={handleToggleExpand}
        />
      </div>
    </Container>
  );
}

export default function AgentDetailPage(
  props: Parameters<typeof AgentDetailPageContent>[0],
) {
  return (
    <Suspense fallback={null}>
      <AgentDetailPageContent {...props} />
    </Suspense>
  );
}
