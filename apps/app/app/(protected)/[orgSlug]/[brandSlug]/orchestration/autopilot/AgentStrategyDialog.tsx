'use client';

import {
  AgentAutonomyMode,
  AgentRunFrequency,
  AgentType,
  ButtonVariant,
} from '@genfeedai/enums';
import type {
  AgentStrategyDialogProps,
  AgentStrategyFormState,
} from '@props/automation/agent-strategies-page.props';
import type { AgentStrategy } from '@services/automation/agent-strategies.service';
import { Button } from '@ui/primitives/button';
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
import { useCallback, useEffect, useState } from 'react';

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

export default function AgentStrategyDialog({
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
              <span className="text-sm font-medium text-foreground">
                Agent Type
              </span>
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
              <span className="text-sm font-medium text-foreground">
                Autonomy
              </span>
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
              <span className="text-sm font-medium text-foreground">
                Run Frequency
              </span>
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
              <span className="text-sm font-medium text-foreground">
                Goal Profile
              </span>
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

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Skill Slugs</p>
            <Input
              placeholder="e.g. content-writing, image-generation"
              value={form.skillSlugs.join(', ')}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                setForm((prev) => ({
                  ...prev,
                  skillSlugs: event.target.value.split(',').flatMap((slug) => {
                    const trimmedSlug = slug.trim();
                    return trimmedSlug ? [trimmedSlug] : [];
                  }),
                }))
              }
            />
            <p className="text-xs text-foreground/50">
              Comma-separated skill slugs. Leave empty to use all brand-enabled
              skills.
            </p>
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
            <span className="flex items-center gap-3 text-sm text-foreground">
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
            </span>

            <span className="flex items-center gap-3 text-sm text-foreground">
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
            </span>

            <span className="flex items-center gap-3 text-sm text-foreground">
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
            </span>
          </div>

          <div className="grid gap-3 rounded-lg border border-white/10 p-4 md:grid-cols-2">
            <span className="flex items-center gap-3 text-sm text-foreground">
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
            </span>

            <span className="flex items-center gap-3 text-sm text-foreground">
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
            </span>

            <span className="flex items-center gap-3 text-sm text-foreground">
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
            </span>

            <span className="flex items-center gap-3 text-sm text-foreground">
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
            </span>

            <span className="flex items-center gap-3 text-sm text-foreground">
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
            </span>
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
