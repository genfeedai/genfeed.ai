import {
  AgentAutonomyMode,
  AgentRunFrequency,
  AgentType,
} from '@genfeedai/enums';
import type {
  AgentStrategyDialogProps,
  AgentStrategyFormState,
} from '@props/automation/agent-strategies-page.props';
import type { AgentStrategy } from '@services/automation/agent-strategies.service';
import { useCallback, useEffect, useState } from 'react';

export const PLATFORM_OPTIONS = [
  { label: 'Twitter / X', value: 'twitter' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'TikTok', value: 'tiktok' },
  { label: 'YouTube', value: 'youtube' },
  { label: 'LinkedIn', value: 'linkedin' },
  { label: 'Facebook', value: 'facebook' },
];

export const AGENT_TYPE_OPTIONS = [
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

export const AUTONOMY_MODE_OPTIONS = [
  { label: 'Supervised', value: AgentAutonomyMode.SUPERVISED },
  { label: 'Auto Publish', value: AgentAutonomyMode.AUTO_PUBLISH },
];

export const RUN_FREQUENCY_OPTIONS = [
  { label: 'Daily', value: AgentRunFrequency.DAILY },
  { label: 'Twice Daily', value: AgentRunFrequency.TWICE_DAILY },
  { label: 'Every 6 Hours', value: AgentRunFrequency.EVERY_6_HOURS },
];

export const GOAL_PROFILE_OPTIONS = [
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
  skillSlugs: [],
  reserveTrendBudget: '125',
  runFrequency: AgentRunFrequency.DAILY,
  topics: '',
  trendWatchersEnabled: true,
  weeklySummaryEnabled: true,
};

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
    skillSlugs: strategy.skillSlugs ?? [],
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

export function useAgentStrategyDialog({
  initialStrategy,
  isOpen,
  onSubmit,
}: Pick<AgentStrategyDialogProps, 'initialStrategy' | 'isOpen' | 'onSubmit'>) {
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

  return { form, setForm, handlePlatformToggle, handleSubmit };
}
