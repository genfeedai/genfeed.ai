import {
  AgentAutonomyMode,
  AgentRunFrequency,
  AgentType,
} from '@genfeedai/enums';
import type { TableColumn } from '@props/ui/display/table.props';
import type { AgentStrategy } from '@services/automation/agent-strategies.service';
import Badge from '@ui/display/badge/Badge';
import { formatDistanceToNow } from 'date-fns';
import { useMemo } from 'react';
import { FaLinkedin, FaXTwitter, FaYoutube } from 'react-icons/fa6';
import {
  HiOutlineBolt,
  HiOutlineCpuChip,
  HiOutlineDocumentText,
  HiOutlineMegaphone,
  HiOutlinePencilSquare,
  HiOutlinePhoto,
  HiOutlinePlayCircle,
  HiOutlineSparkles,
  HiOutlineUser,
  HiOutlineVideoCamera,
} from 'react-icons/hi2';

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
  [AgentType.GENERAL]: <HiOutlineCpuChip className="size-4" />,
  [AgentType.X_CONTENT]: <FaXTwitter className="size-4" />,
  [AgentType.IMAGE_CREATOR]: <HiOutlinePhoto className="size-4" />,
  [AgentType.VIDEO_CREATOR]: <HiOutlineVideoCamera className="size-4" />,
  [AgentType.AI_AVATAR]: <HiOutlineUser className="size-4" />,
  [AgentType.ARTICLE_WRITER]: <HiOutlineDocumentText className="size-4" />,
  [AgentType.LINKEDIN_CONTENT]: <FaLinkedin className="size-4" />,
  [AgentType.ADS_SCRIPT_WRITER]: <HiOutlineMegaphone className="size-4" />,
  [AgentType.SHORT_FORM_WRITER]: <HiOutlineBolt className="size-4" />,
  [AgentType.CTA_CONTENT]: <HiOutlineSparkles className="size-4" />,
  [AgentType.YOUTUBE_SCRIPT]: <FaYoutube className="size-4" />,
  [AgentType.BRAND_INTERVIEW]: <HiOutlineSparkles className="size-4" />,
};

const AUTONOMY_MODE_LABELS: Record<AgentAutonomyMode, string> = {
  [AgentAutonomyMode.SUPERVISED]: 'Supervised',
  [AgentAutonomyMode.AUTO_PUBLISH]: 'Autopilot',
};

const RUN_FREQUENCY_LABELS: Record<AgentRunFrequency, string> = {
  [AgentRunFrequency.DAILY]: 'Daily',
  [AgentRunFrequency.TWICE_DAILY]: 'Twice daily',
  [AgentRunFrequency.EVERY_6_HOURS]: 'Every 6 hours',
};

function formatRelativeDate(dateStr?: string): string {
  if (!dateStr) {
    return 'Never';
  }

  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return '—';
  }
}

export function useAgentStrategiesColumns(
  openEditDialog: (strategy: AgentStrategy) => void,
  handleRunNow: (strategy: AgentStrategy) => Promise<void>,
  handleToggle: (strategy: AgentStrategy) => Promise<void>,
) {
  const columns = useMemo<TableColumn<AgentStrategy>[]>(
    () => [
      {
        header: 'Strategy',
        key: 'label',
        render: (strategy) => {
          const icon =
            AGENT_TYPE_ICONS[strategy.agentType as AgentType] ??
            AGENT_TYPE_ICONS[AgentType.GENERAL];

          return (
            <div className="flex items-center gap-3">
              <span className="flex size-8 items-center justify-center rounded bg-white/5 text-white/70">
                {icon}
              </span>
              <div className="flex flex-col">
                <span className="font-medium">{strategy.label}</span>
                <span className="text-xs text-foreground/50">
                  {strategy.topics.length > 0
                    ? strategy.topics.join(', ')
                    : 'No topics configured'}
                </span>
              </div>
            </div>
          );
        },
      },
      {
        header: 'Type',
        key: 'agentType',
        render: (strategy) => (
          <span className="text-sm">
            {AGENT_TYPE_LABELS[strategy.agentType as AgentType] ??
              strategy.agentType}
          </span>
        ),
      },
      {
        header: 'Autonomy',
        key: 'autonomyMode',
        render: (strategy) => (
          <Badge
            variant={
              strategy.autonomyMode === AgentAutonomyMode.AUTO_PUBLISH
                ? 'success'
                : 'secondary'
            }
          >
            {AUTONOMY_MODE_LABELS[strategy.autonomyMode as AgentAutonomyMode]}
          </Badge>
        ),
      },
      {
        header: 'Platforms',
        key: 'platforms',
        render: (strategy) => (
          <span className="text-sm">
            {strategy.platforms.length > 0
              ? strategy.platforms.join(', ')
              : '—'}
          </span>
        ),
      },
      {
        header: 'Skills',
        key: 'skillSlugs',
        render: (strategy) => (
          <span className="text-sm">
            {strategy.skillSlugs.length > 0
              ? strategy.skillSlugs.join(', ')
              : '—'}
          </span>
        ),
      },
      {
        header: 'Schedule',
        key: 'runFrequency',
        render: (strategy) => (
          <div className="flex flex-col text-sm">
            <span>
              {RUN_FREQUENCY_LABELS[strategy.runFrequency as AgentRunFrequency]}
            </span>
            <span className="text-xs text-foreground/50">
              {strategy.timezone || 'UTC'}
            </span>
          </div>
        ),
      },
      {
        header: 'Budget',
        key: 'dailyCreditBudget',
        render: (strategy) => (
          <div className="flex flex-col text-sm">
            <span>{strategy.dailyCreditBudget} daily</span>
            <span className="text-xs text-foreground/50">
              {strategy.creditsUsedToday} used today
            </span>
          </div>
        ),
      },
      {
        header: 'Last Run',
        key: 'lastRunAt',
        render: (strategy) => (
          <span className="text-sm">
            {formatRelativeDate(strategy.lastRunAt)}
          </span>
        ),
      },
      {
        header: 'Status',
        key: 'isActive',
        render: (strategy) => (
          <div className="flex flex-col gap-1">
            <Badge variant={strategy.isActive ? 'success' : 'secondary'}>
              {strategy.isActive ? 'Active' : 'Paused'}
            </Badge>
            {!strategy.isEnabled && (
              <span className="text-xs text-foreground/50">Disabled</span>
            )}
          </div>
        ),
      },
    ],
    [],
  );

  const actions = useMemo(
    () => [
      {
        icon: <HiOutlinePencilSquare />,
        onClick: (strategy: AgentStrategy) => openEditDialog(strategy),
        tooltip: 'Edit strategy',
      },
      {
        icon: <HiOutlinePlayCircle />,
        isDisabled: (strategy: AgentStrategy) =>
          !strategy.isActive || !strategy.isEnabled,
        onClick: (strategy: AgentStrategy) => {
          void handleRunNow(strategy);
        },
        tooltip: 'Run now',
      },
      {
        icon: (strategy: AgentStrategy) => (
          <span className="text-xs font-semibold">
            {strategy.isActive ? 'Pause' : 'Start'}
          </span>
        ),
        onClick: (strategy: AgentStrategy) => {
          void handleToggle(strategy);
        },
        tooltip: (strategy: AgentStrategy) =>
          strategy.isActive ? 'Pause strategy' : 'Activate strategy',
      },
    ],
    [handleRunNow, handleToggle, openEditDialog],
  );

  return { actions, columns };
}
