'use client';

import { AgentType, ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useAgentStrategies } from '@hooks/data/agent-strategies/use-agent-strategies';
import {
  AgentStrategiesService,
  type AgentStrategy,
} from '@services/automation/agent-strategies.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Button from '@ui/buttons/base/Button';
import Container from '@ui/layout/container/Container';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { useCallback, useEffect, useRef } from 'react';
import { FaLinkedin, FaXTwitter, FaYoutube } from 'react-icons/fa6';
import {
  HiOutlineBolt,
  HiOutlineCpuChip,
  HiOutlineDocumentText,
  HiOutlineMegaphone,
  HiOutlinePhoto,
  HiOutlinePlayCircle,
  HiOutlineSparkles,
  HiOutlineUser,
  HiOutlineVideoCamera,
  HiPlus,
} from 'react-icons/hi2';

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

function AgentCard({
  strategy,
  onToggle,
  onRunNow,
}: {
  strategy: AgentStrategy;
  onToggle: (id: string) => Promise<void>;
  onRunNow: (id: string) => Promise<void>;
}) {
  const agentType = strategy.agentType as AgentType;
  const icon = AGENT_TYPE_ICONS[agentType] ?? (
    <HiOutlineCpuChip className="size-5" />
  );
  const typeLabel = AGENT_TYPE_LABELS[agentType] ?? strategy.agentType;

  const lastRunLabel = strategy.lastRunAt
    ? formatDistanceToNow(new Date(strategy.lastRunAt), { addSuffix: true })
    : 'Never';

  return (
    <div className="rounded border border-foreground/10 bg-background p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded bg-foreground/5 text-foreground/70">
            {icon}
          </span>
          <div>
            <p className="font-medium text-sm">{strategy.label}</p>
            <p className="text-xs text-foreground/50 uppercase tracking-wide">
              {typeLabel}
            </p>
          </div>
        </div>
        <span
          className={`mt-1 size-2 rounded-full shrink-0 ${strategy.isActive ? 'bg-success' : 'bg-foreground/20'}`}
          title={strategy.isActive ? 'Active' : 'Inactive'}
        />
      </div>

      {strategy.brand && (
        <p className="text-xs text-foreground/50">Brand: {strategy.brand}</p>
      )}

      <div className="grid grid-cols-2 gap-2 text-xs text-foreground/60">
        <div>
          <span className="block text-foreground/40">Last run</span>
          <span>{lastRunLabel}</span>
        </div>
        <div>
          <span className="block text-foreground/40">Credits today</span>
          <span>
            {strategy.creditsUsedToday} / {strategy.dailyCreditBudget}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button
          label="Run Now"
          icon={<HiOutlinePlayCircle />}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          onClick={() => onRunNow(strategy.id)}
          tooltip="Trigger immediate run"
        />
        <Button
          label={strategy.isActive ? 'Pause' : 'Activate'}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          onClick={() => onToggle(strategy.id)}
        />
        <Link
          href={`/orchestration/${strategy.id}`}
          className="ml-auto text-xs text-foreground/50 hover:text-foreground underline underline-offset-2"
        >
          View detail
        </Link>
      </div>
    </div>
  );
}

export default function AgentHubPage() {
  const { strategies, isLoading, refresh } = useAgentStrategies();
  const notificationsService = NotificationsService.getInstance();

  const getService = useAuthedService((token: string) =>
    AgentStrategiesService.getInstance(token),
  );

  // Auto-refresh every 30 seconds
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    const interval = setInterval(() => {
      refreshRef.current();
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  const handleToggle = useCallback(
    async (id: string) => {
      try {
        const service = await getService();
        await service.toggle(id);
        await refresh();
        notificationsService.success('Agent status updated');
      } catch (error) {
        logger.error('Failed to toggle agent', { error });
        notificationsService.error('Failed to update agent status');
      }
    },
    [getService, refresh, notificationsService],
  );

  const handleRunNow = useCallback(
    async (id: string) => {
      try {
        const service = await getService();
        await service.runNow(id);
        notificationsService.success('Agent run triggered');
      } catch (error) {
        logger.error('Failed to trigger agent run', { error });
        notificationsService.error('Failed to trigger run');
      }
    },
    [getService, notificationsService],
  );

  return (
    <Container
      label="Agent Hub"
      description="Manage your content agents."
      icon={HiOutlineCpuChip}
      right={
        <Link href="/orchestration/new">
          <Button
            label={
              <>
                <HiPlus /> New Agent
              </>
            }
            variant={ButtonVariant.DEFAULT}
          />
        </Link>
      }
    >
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-44 animate-pulse rounded border border-foreground/10 bg-foreground/5"
            />
          ))}
        </div>
      ) : strategies.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-foreground/5 text-foreground/30">
            <HiOutlineCpuChip className="size-8" />
          </span>
          <div>
            <p className="text-lg font-medium">No agents yet</p>
            <p className="mt-1 text-sm text-foreground/50">
              Create your first agent to start automating content creation
            </p>
          </div>
          <Link href="/orchestration/new">
            <Button
              label="Create your first agent"
              variant={ButtonVariant.DEFAULT}
              icon={<HiPlus />}
            />
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {strategies.map((strategy) => (
            <AgentCard
              key={strategy.id}
              strategy={strategy}
              onToggle={handleToggle}
              onRunNow={handleRunNow}
            />
          ))}
        </div>
      )}
    </Container>
  );
}
