'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type { AgentStrategyDialogProps } from '@props/automation/agent-strategies-page.props';
import { Button } from '@ui/primitives/button';
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
import AgentStrategyBudgetFields from './AgentStrategyBudgetFields';
import AgentStrategyPublishToggles from './AgentStrategyPublishToggles';
import AgentStrategyScoreFields from './AgentStrategyScoreFields';
import AgentStrategySourceToggles from './AgentStrategySourceToggles';
import {
  AGENT_TYPE_OPTIONS,
  AUTONOMY_MODE_OPTIONS,
  GOAL_PROFILE_OPTIONS,
  PLATFORM_OPTIONS,
  RUN_FREQUENCY_OPTIONS,
  useAgentStrategyDialog,
} from './useAgentStrategyDialog';

export default function AgentStrategyDialog({
  initialStrategy,
  isOpen,
  isSubmitting,
  onOpenChange,
  onSubmit,
}: AgentStrategyDialogProps) {
  const { form, setForm, handlePlatformToggle, handleSubmit } =
    useAgentStrategyDialog({ initialStrategy, isOpen, onSubmit });

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
                  setForm((prev) => ({ ...prev, label: event.target.value }))
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
                    agentType:
                      value as (typeof AGENT_TYPE_OPTIONS)[number]['value'],
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
                    autonomyMode:
                      value as (typeof AUTONOMY_MODE_OPTIONS)[number]['value'],
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
                    runFrequency:
                      value as (typeof RUN_FREQUENCY_OPTIONS)[number]['value'],
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
                setForm((prev) => ({ ...prev, topics: event.target.value }))
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

          <AgentStrategyBudgetFields form={form} setForm={setForm} />
          <AgentStrategyScoreFields form={form} setForm={setForm} />
          <AgentStrategyPublishToggles form={form} setForm={setForm} />
          <AgentStrategySourceToggles form={form} setForm={setForm} />

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
