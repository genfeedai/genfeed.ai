'use client';

import {
  AgentAutonomyMode,
  AgentRunFrequency,
  AgentType,
  ButtonVariant,
} from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useAgentStrategies } from '@hooks/data/agent-strategies/use-agent-strategies';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type {
  AgentStrategyDialogProps,
  AgentStrategyFormState,
} from '@props/automation/agent-strategies-page.props';
import type { TableColumn } from '@props/ui/display/table.props';
import {
  AgentStrategiesService,
  type AgentStrategy,
  type CreateAgentStrategyInput,
} from '@services/automation/agent-strategies.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Button from '@ui/buttons/base/Button';
import Badge from '@ui/display/badge/Badge';
import AppTable from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import { Checkbox } from '@ui/primitives/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  HiPlus,
} from 'react-icons/hi2';

const PLATFORM_OPTIONS = [
  { label: 'Twitter / X', value: 'twitter' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'TikTok', value: 'tiktok' },
  { label: 'YouTube', value: 'youtube' },
  { label: 'LinkedIn', value: 'linkedin' },
  { label: 'Facebook', value: 'facebook' },
];

const AGENT_TYPE_OPTIONS = [
  { label: 'General', value: AgentType.GENERAL },
  { label: 'X Content', value: AgentType.X_CONTENT },
  { label: 'Image Creator', value: AgentType.IMAGE_CREATOR },
  { label: 'Video Creator', value: AgentType.VIDEO_CREATOR },
  { label: 'AI Avatar', value: AgentType.AI_AVATAR },
  { label: 'Article Writer', value: AgentType.ARTICLE_WRITER },
  { label: 'LinkedIn Copywriter', value: AgentType.LINKEDIN_CONTENT },
  { label: 'Ads Script Writer', value: AgentType.ADS_SCRIPT_WRITER },
  { label: 'Short-Form Writer', value: AgentType.SHORT_FORM_WRITER },
  { label: 'CTA / Conversion', value: AgentType.CTA_CONTENT },
  { label: 'YouTube Script', value: AgentType.YOUTUBE_SCRIPT },
];

const AUTONOMY_MODE_OPTIONS = [
  { label: 'Supervised', value: AgentAutonomyMode.SUPERVISED },
  { label: 'Auto Publish', value: AgentAutonomyMode.AUTO_PUBLISH },
];

const RUN_FREQUENCY_OPTIONS = [
  { label: 'Daily', value: AgentRunFrequency.DAILY },
  { label: 'Twice Daily', value: AgentRunFrequency.TWICE_DAILY },
  { label: 'Every 6 Hours', value: AgentRunFrequency.EVERY_6_HOURS },
];

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

const GOAL_PROFILE_OPTIONS = [
  { label: 'Reach + Traffic', value: 'reach_traffic' as const },
];

const DEFAULT_FORM_STATE: AgentStrategyFormState = {
  agentType: AgentType.GENERAL,
  autonomyMode: AgentAutonomyMode.SUPERVISED,
  autoPublishConfidenceThreshold: '0.8',
  autoPublishEnabled: false,
  dailyCreditBudget: '100',
  dailyDigestEnabled: true,
  eventTriggersEnabled: true,
  evergreenCadenceEnabled: true,
  goalProfile: 'reach_traffic',
  isActive: true,
  isEnabled: true,
  label: '',
  minCreditThreshold: '50',
  minImageScore: '75',
  minPostScore: '70',
  monthlyCreditBudget: '500',
  platforms: ['twitter'],
  reserveTrendBudget: '125',
  runFrequency: AgentRunFrequency.DAILY,
  topics: '',
  trendWatchersEnabled: true,
  weeklySummaryEnabled: true,
};

type AgentStrategyPayload = CreateAgentStrategyInput & {
  isEnabled: boolean;
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

function buildFormState(
  strategy?: AgentStrategy | null,
): AgentStrategyFormState {
  if (!strategy) {
    return DEFAULT_FORM_STATE;
  }

  return {
    agentType: strategy.agentType as AgentType,
    autonomyMode: strategy.autonomyMode as AgentAutonomyMode,
    autoPublishConfidenceThreshold: String(
      strategy.autoPublishConfidenceThreshold ?? 0.8,
    ),
    autoPublishEnabled: strategy.publishPolicy?.autoPublishEnabled ?? false,
    dailyCreditBudget: String(strategy.dailyCreditBudget ?? 100),
    dailyDigestEnabled: strategy.reportingPolicy?.dailyDigestEnabled ?? true,
    eventTriggersEnabled:
      strategy.opportunitySources?.eventTriggersEnabled ?? true,
    evergreenCadenceEnabled:
      strategy.opportunitySources?.evergreenCadenceEnabled ?? true,
    goalProfile: strategy.goalProfile ?? 'reach_traffic',
    isActive: strategy.isActive,
    isEnabled: strategy.isEnabled ?? true,
    label: strategy.label,
    minCreditThreshold: String(strategy.minCreditThreshold ?? 50),
    minImageScore: String(strategy.publishPolicy?.minImageScore ?? 75),
    minPostScore: String(strategy.publishPolicy?.minPostScore ?? 70),
    monthlyCreditBudget: String(
      strategy.budgetPolicy?.monthlyCreditBudget ?? 500,
    ),
    platforms: strategy.platforms ?? [],
    reserveTrendBudget: String(
      strategy.budgetPolicy?.reserveTrendBudget ?? 125,
    ),
    runFrequency: strategy.runFrequency as AgentRunFrequency,
    topics: strategy.topics.join(', '),
    trendWatchersEnabled:
      strategy.opportunitySources?.trendWatchersEnabled ?? true,
    weeklySummaryEnabled:
      strategy.reportingPolicy?.weeklySummaryEnabled ?? true,
  };
}

function buildPayload(form: AgentStrategyFormState): AgentStrategyPayload {
  return {
    agentType: form.agentType,
    autonomyMode: form.autonomyMode,
    autoPublishConfidenceThreshold:
      Number(form.autoPublishConfidenceThreshold) || 0,
    budgetPolicy: {
      monthlyCreditBudget: Number(form.monthlyCreditBudget) || 0,
      reserveTrendBudget: Number(form.reserveTrendBudget) || 0,
    },
    dailyCreditBudget: Number(form.dailyCreditBudget) || 0,
    goalProfile: form.goalProfile,
    isActive: form.isActive,
    isEnabled: form.isEnabled,
    label: form.label.trim(),
    minCreditThreshold: Number(form.minCreditThreshold) || 0,
    opportunitySources: {
      eventTriggersEnabled: form.eventTriggersEnabled,
      evergreenCadenceEnabled: form.evergreenCadenceEnabled,
      trendWatchersEnabled: form.trendWatchersEnabled,
    },
    platforms: form.platforms,
    publishPolicy: {
      autoPublishEnabled: form.autoPublishEnabled,
      minImageScore: Number(form.minImageScore) || 0,
      minPostScore: Number(form.minPostScore) || 0,
    },
    reportingPolicy: {
      dailyDigestEnabled: form.dailyDigestEnabled,
      weeklySummaryEnabled: form.weeklySummaryEnabled,
    },
    runFrequency: form.runFrequency,
    topics: form.topics
      .split(',')
      .map((topic) => topic.trim())
      .filter(Boolean),
  };
}

function AgentStrategyDialog({
  initialStrategy,
  isOpen,
  isSubmitting,
  onOpenChange,
  onSubmit,
}: AgentStrategyDialogProps) {
  const [form, setForm] = useState<AgentStrategyFormState>(() =>
    buildFormState(initialStrategy),
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setForm(buildFormState(initialStrategy));
  }, [initialStrategy, isOpen]);

  const handlePlatformToggle = useCallback((platform: string) => {
    setForm((prev) => ({
      ...prev,
      platforms: prev.platforms.includes(platform)
        ? prev.platforms.filter((item) => item !== platform)
        : [...prev.platforms, platform],
    }));
  }, []);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      await onSubmit(form);
    },
    [form, onSubmit],
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {initialStrategy ? 'Edit Autopilot Policy' : 'Add Autopilot Policy'}
          </DialogTitle>
          <DialogDescription>
            Configure one autopilot policy for adaptive agent execution.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="strategy-label"
              >
                Policy Label
              </label>
              <Input
                id="strategy-label"
                value={form.label}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    label: event.target.value,
                  }))
                }
                placeholder="e.g. Daily X Growth"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Agent Type
              </label>
              <Select
                value={form.agentType}
                onValueChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    agentType: value as AgentType,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select agent type" />
                </SelectTrigger>
                <SelectContent>
                  {AGENT_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Autonomy
              </label>
              <Select
                value={form.autonomyMode}
                onValueChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    autonomyMode: value as AgentAutonomyMode,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select autonomy mode" />
                </SelectTrigger>
                <SelectContent>
                  {AUTONOMY_MODE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Run Frequency
              </label>
              <Select
                value={form.runFrequency}
                onValueChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    runFrequency: value as AgentRunFrequency,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select frequency" />
                </SelectTrigger>
                <SelectContent>
                  {RUN_FREQUENCY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Goal Profile
              </label>
              <Select
                value={form.goalProfile}
                onValueChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    goalProfile: value as 'reach_traffic',
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select goal profile" />
                </SelectTrigger>
                <SelectContent>
                  {GOAL_PROFILE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              className="text-sm font-medium text-foreground"
              htmlFor="strategy-topics"
            >
              Topics
            </label>
            <Textarea
              id="strategy-topics"
              value={form.topics}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  topics: event.target.value,
                }))
              }
              placeholder="marketing, AI, product updates"
              className="min-h-24"
            />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Platforms</p>
            <div className="flex flex-wrap gap-2">
              {PLATFORM_OPTIONS.map((platform) => {
                const isSelected = form.platforms.includes(platform.value);

                return (
                  <Button
                    key={platform.value}
                    withWrapper={false}
                    variant={
                      isSelected
                        ? ButtonVariant.DEFAULT
                        : ButtonVariant.SECONDARY
                    }
                    onClick={() => handlePlatformToggle(platform.value)}
                    type="button"
                    className="transition-colors"
                  >
                    {platform.label}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="strategy-daily-budget"
              >
                Daily Budget
              </label>
              <Input
                id="strategy-daily-budget"
                min={0}
                type="number"
                value={form.dailyCreditBudget}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    dailyCreditBudget: event.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="strategy-credit-threshold"
              >
                Min Credits
              </label>
              <Input
                id="strategy-credit-threshold"
                min={0}
                type="number"
                value={form.minCreditThreshold}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    minCreditThreshold: event.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="strategy-confidence-threshold"
              >
                Auto-publish Threshold
              </label>
              <Input
                id="strategy-confidence-threshold"
                max={1}
                min={0}
                step="0.05"
                type="number"
                value={form.autoPublishConfidenceThreshold}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    autoPublishConfidenceThreshold: event.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="strategy-monthly-budget"
              >
                Monthly Budget
              </label>
              <Input
                id="strategy-monthly-budget"
                min={0}
                type="number"
                value={form.monthlyCreditBudget}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    monthlyCreditBudget: event.target.value,
                  }))
                }
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="strategy-trend-reserve"
              >
                Trend Reserve
              </label>
              <Input
                id="strategy-trend-reserve"
                min={0}
                type="number"
                value={form.reserveTrendBudget}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    reserveTrendBudget: event.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="strategy-min-post-score"
              >
                Min Post Score
              </label>
              <Input
                id="strategy-min-post-score"
                max={100}
                min={0}
                type="number"
                value={form.minPostScore}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    minPostScore: event.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="strategy-min-image-score"
              >
                Min Image Score
              </label>
              <Input
                id="strategy-min-image-score"
                max={100}
                min={0}
                type="number"
                value={form.minImageScore}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    minImageScore: event.target.value,
                  }))
                }
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-white/10 p-4">
            <label className="flex items-center gap-3 text-sm text-foreground">
              <Checkbox
                checked={form.autoPublishEnabled}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({
                    ...prev,
                    autoPublishEnabled: checked === true,
                  }))
                }
                aria-label="Enable autopilot auto publish"
              />
              Enforce autopilot publish gate before auto-publishing text drafts
            </label>

            <label className="flex items-center gap-3 text-sm text-foreground">
              <Checkbox
                checked={form.isEnabled}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({
                    ...prev,
                    isEnabled: checked === true,
                  }))
                }
                aria-label="Enable strategy"
              />
              Enabled for scheduling
            </label>

            <label className="flex items-center gap-3 text-sm text-foreground">
              <Checkbox
                checked={form.isActive}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({
                    ...prev,
                    isActive: checked === true,
                  }))
                }
                aria-label="Mark strategy active"
              />
              Active and ready to run
            </label>
          </div>

          <div className="grid gap-3 rounded-lg border border-white/10 p-4 md:grid-cols-2">
            <label className="flex items-center gap-3 text-sm text-foreground">
              <Checkbox
                checked={form.trendWatchersEnabled}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({
                    ...prev,
                    trendWatchersEnabled: checked === true,
                  }))
                }
                aria-label="Enable trend watchers"
              />
              Trend watchers
            </label>

            <label className="flex items-center gap-3 text-sm text-foreground">
              <Checkbox
                checked={form.eventTriggersEnabled}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({
                    ...prev,
                    eventTriggersEnabled: checked === true,
                  }))
                }
                aria-label="Enable event triggers"
              />
              Event triggers
            </label>

            <label className="flex items-center gap-3 text-sm text-foreground">
              <Checkbox
                checked={form.evergreenCadenceEnabled}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({
                    ...prev,
                    evergreenCadenceEnabled: checked === true,
                  }))
                }
                aria-label="Enable evergreen cadence"
              />
              Evergreen cadence
            </label>

            <label className="flex items-center gap-3 text-sm text-foreground">
              <Checkbox
                checked={form.dailyDigestEnabled}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({
                    ...prev,
                    dailyDigestEnabled: checked === true,
                  }))
                }
                aria-label="Enable daily digest"
              />
              Daily digest
            </label>

            <label className="flex items-center gap-3 text-sm text-foreground">
              <Checkbox
                checked={form.weeklySummaryEnabled}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({
                    ...prev,
                    weeklySummaryEnabled: checked === true,
                  }))
                }
                aria-label="Enable weekly summary"
              />
              Weekly summary
            </label>
          </div>

          <DialogFooter className="gap-2 sm:space-x-0">
            <Button
              label="Cancel"
              type="button"
              variant={ButtonVariant.SECONDARY}
              onClick={() => onOpenChange(false)}
            />
            <Button
              label={
                initialStrategy
                  ? 'Save Autopilot Changes'
                  : 'Create Autopilot Policy'
              }
              type="submit"
              variant={ButtonVariant.DEFAULT}
              isDisabled={isSubmitting}
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AgentStrategiesPage() {
  const router = useRouter();
  const { href } = useOrgUrl();
  const notificationsService = NotificationsService.getInstance();
  const { strategies, isLoading, refresh } = useAgentStrategies();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedStrategy, setSelectedStrategy] =
    useState<AgentStrategy | null>(null);

  const getService = useAuthedService((token: string) =>
    AgentStrategiesService.getInstance(token),
  );

  const openCreateDialog = useCallback(() => {
    setSelectedStrategy(null);
    setIsDialogOpen(true);
  }, []);

  const openEditDialog = useCallback((strategy: AgentStrategy) => {
    setSelectedStrategy(strategy);
    setIsDialogOpen(true);
  }, []);

  const handleDialogChange = useCallback((isOpen: boolean) => {
    setIsDialogOpen(isOpen);
    if (!isOpen) {
      setSelectedStrategy(null);
    }
  }, []);

  const handleSubmit = useCallback(
    async (form: AgentStrategyFormState) => {
      if (!form.label.trim()) {
        notificationsService.error('Strategy label is required');
        return;
      }

      if (form.platforms.length === 0) {
        notificationsService.error('Select at least one platform');
        return;
      }

      setIsSubmitting(true);

      try {
        const service = await getService();
        const payload = buildPayload(form);

        if (selectedStrategy) {
          await service.update(selectedStrategy.id, payload);
          notificationsService.success('Strategy updated');
        } else {
          await service.create(payload);
          notificationsService.success('Strategy created');
        }

        handleDialogChange(false);
        await refresh();
      } catch (error) {
        logger.error('Failed to save strategy', { error });
        notificationsService.error('Failed to save strategy');
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      getService,
      handleDialogChange,
      notificationsService,
      refresh,
      selectedStrategy,
    ],
  );

  const handleToggle = useCallback(
    async (strategy: AgentStrategy) => {
      try {
        const service = await getService();
        await service.toggle(strategy.id);
        notificationsService.success(
          strategy.isActive ? 'Strategy paused' : 'Strategy activated',
        );
        await refresh();
      } catch (error) {
        logger.error('Failed to toggle strategy', { error });
        notificationsService.error('Failed to update strategy');
      }
    },
    [getService, notificationsService, refresh],
  );

  const handleRunNow = useCallback(
    async (strategy: AgentStrategy) => {
      try {
        const service = await getService();
        await service.runNow(strategy.id);
        notificationsService.success('Strategy run triggered');
        await refresh();
      } catch (error) {
        logger.error('Failed to run strategy', { error });
        notificationsService.error('Failed to trigger strategy run');
      }
    },
    [getService, notificationsService, refresh],
  );

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

  return (
    <>
      <Container
        label="Autopilot"
        description="Use autopilot policies to schedule adaptive agent runs."
        icon={HiOutlineCpuChip}
        right={
          <Button
            label={
              <>
                <HiPlus /> Add Autopilot
              </>
            }
            variant={ButtonVariant.DEFAULT}
            onClick={openCreateDialog}
          />
        }
      >
        <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-foreground/70">
          <span className="font-medium text-foreground">
            Autopilot policies
          </span>{' '}
          are agent policies: they decide when an agent runs, its budget, and
          its direction. Use autopilot when the agent should adapt each run. For
          fixed step-by-step automation graphs, use
          <Link
            href={href('/workflows')}
            className="ml-1 underline underline-offset-2"
          >
            Workflows
          </Link>
          .
        </div>
        <AppTable<AgentStrategy>
          items={strategies}
          columns={columns}
          actions={actions}
          isLoading={isLoading}
          getRowKey={(strategy) => strategy.id}
          onRowClick={(strategy) =>
            router.push(`/orchestration/${strategy.id}`)
          }
          emptyState={
            <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-white/10 p-10 text-center">
              <span className="flex size-14 items-center justify-center rounded-full bg-white/5 text-white/40">
                <HiOutlineCpuChip className="size-7" />
              </span>
              <div className="space-y-1">
                <p className="text-lg font-medium">No autopilot policies yet</p>
                <p className="text-sm text-foreground/50">
                  Create your first autopilot policy to start scheduling agent
                  runs.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  label="Add Autopilot"
                  icon={<HiPlus />}
                  variant={ButtonVariant.DEFAULT}
                  onClick={openCreateDialog}
                />
                <Link href="/orchestration/new">
                  <Button
                    label="Open Full Wizard"
                    variant={ButtonVariant.SECONDARY}
                  />
                </Link>
              </div>
            </div>
          }
        />
      </Container>

      <AgentStrategyDialog
        initialStrategy={selectedStrategy}
        isOpen={isDialogOpen}
        isSubmitting={isSubmitting}
        onOpenChange={handleDialogChange}
        onSubmit={handleSubmit}
      />
    </>
  );
}
