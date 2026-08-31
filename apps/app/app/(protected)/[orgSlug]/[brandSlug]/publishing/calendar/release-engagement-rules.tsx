'use client';

import {
  ButtonSize,
  ButtonVariant,
  EngagementMetric,
  EngagementRuleAction,
  EngagementRuleMode,
  EngagementRuleState,
} from '@genfeedai/enums';
import type { IEngagementRule } from '@genfeedai/interfaces';
import { useEngagementRules } from '@hooks/data/content/use-engagement-rules';
import { useOrgUrl } from '@hooks/navigation/use-org-url/use-org-url';
import type { ReleaseEngagementRulesProps } from '@props/scheduler/engagement-rules.props';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Switch } from '@ui/primitives/switch';
import Link from 'next/link';
import { type ChangeEvent, useCallback, useState } from 'react';

function parseMetric(value: string): EngagementMetric {
  switch (value) {
    case EngagementMetric.COMMENTS:
      return EngagementMetric.COMMENTS;
    case EngagementMetric.SHARES:
      return EngagementMetric.SHARES;
    case EngagementMetric.VIEWS:
      return EngagementMetric.VIEWS;
    case EngagementMetric.ENGAGEMENT_RATE:
      return EngagementMetric.ENGAGEMENT_RATE;
    default:
      return EngagementMetric.LIKES;
  }
}

function parseAction(value: string): EngagementRuleAction {
  if (value === EngagementRuleAction.FOLLOW_UP_COMMENT) {
    return EngagementRuleAction.FOLLOW_UP_COMMENT;
  }
  return EngagementRuleAction.REPOST;
}

function parseMode(value: string): EngagementRuleMode {
  if (value === EngagementRuleMode.AUTO) {
    return EngagementRuleMode.AUTO;
  }
  return EngagementRuleMode.APPROVAL;
}

function metricLabel(metric: EngagementMetric): string {
  switch (metric) {
    case EngagementMetric.COMMENTS:
      return 'Comments';
    case EngagementMetric.SHARES:
      return 'Shares';
    case EngagementMetric.VIEWS:
      return 'Views';
    case EngagementMetric.ENGAGEMENT_RATE:
      return 'Engagement rate';
    default:
      return 'Likes';
  }
}

function actionLabel(action: EngagementRuleAction): string {
  return action === EngagementRuleAction.FOLLOW_UP_COMMENT
    ? 'Follow-up comment'
    : 'Repost';
}

function stateBadgeVariant(
  state: EngagementRuleState,
): 'destructive' | 'outline' | 'success' | 'warning' {
  if (state === EngagementRuleState.COMPLETED) {
    return 'success';
  }
  if (state === EngagementRuleState.TRIGGERED) {
    return 'warning';
  }
  if (
    state === EngagementRuleState.EXPIRED ||
    state === EngagementRuleState.DISABLED
  ) {
    return 'destructive';
  }
  return 'outline';
}

function formatInstant(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatSnapshot(rule: IEngagementRule): string {
  const snapshot = rule.metricSnapshot;
  if (!snapshot) {
    return 'No snapshot';
  }
  return `${snapshot.likes} likes · ${snapshot.comments} comments · ${snapshot.shares} shares · ${snapshot.views} views`;
}

export default function ReleaseEngagementRules({
  postGroupId,
  reconnectHref,
  target,
}: ReleaseEngagementRulesProps) {
  const notifications = NotificationsService.getInstance();
  const { href } = useOrgUrl();
  const { create, isLoading, rules, update } = useEngagementRules({
    postGroupId,
    targetId: target.id,
  });

  const [metric, setMetric] = useState(EngagementMetric.LIKES);
  const [threshold, setThreshold] = useState('100');
  const [actionType, setActionType] = useState(EngagementRuleAction.REPOST);
  const [mode, setMode] = useState(EngagementRuleMode.APPROVAL);
  const [isEnabled, setIsEnabled] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const handleCreate = useCallback(async () => {
    const parsedThreshold = Number(threshold);
    if (!Number.isFinite(parsedThreshold) || parsedThreshold < 0) {
      return;
    }
    setIsSaving(true);
    try {
      await create({
        actionType,
        isEnabled,
        metric,
        mode,
        postGroupId,
        targetId: target.id,
        threshold: parsedThreshold,
      });
      notifications.success('Automation rule created');
    } catch (error) {
      logger.error('Failed to create engagement rule', error);
      notifications.error('Failed to create automation rule');
    } finally {
      setIsSaving(false);
    }
  }, [
    actionType,
    create,
    isEnabled,
    metric,
    mode,
    notifications,
    postGroupId,
    target.id,
    threshold,
  ]);

  const handleToggle = useCallback(
    async (rule: IEngagementRule, nextEnabled: boolean) => {
      try {
        await update(rule.id, { isEnabled: nextEnabled });
      } catch (error) {
        logger.error('Failed to update engagement rule', error);
        notifications.error('Failed to update automation rule');
      }
    },
    [notifications, update],
  );

  return (
    <section className="space-y-3 border-t border-border pt-3">
      <h4 className="text-sm font-medium text-foreground">Automation</h4>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading rules…</p>
      ) : null}

      {rules.map((rule) => (
        <div
          key={rule.id}
          className="space-y-2 rounded-card bg-background-secondary/40 p-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{metricLabel(rule.metric)}</Badge>
            <Badge variant="secondary">{actionLabel(rule.actionType)}</Badge>
            <Badge variant={stateBadgeVariant(rule.state)}>{rule.state}</Badge>
            <Switch
              aria-label={`Enable ${metricLabel(rule.metric)} rule`}
              isChecked={rule.isEnabled}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                void handleToggle(rule, event.target.checked);
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Threshold {rule.threshold} · {rule.mode}
          </p>
          {rule.lastError ? (
            <p className="text-xs text-destructive">{rule.lastError}</p>
          ) : null}
          <div className="space-y-1 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Trigger history</p>
            {rule.triggeredAt ? (
              <p>
                {formatInstant(rule.triggeredAt)} · {formatSnapshot(rule)}
                {rule.resultingReleaseId ? (
                  <>
                    {' · '}
                    <Link
                      className="text-foreground underline"
                      href={href(
                        `/publishing/calendar?release=${rule.resultingReleaseId}`,
                      )}
                    >
                      {rule.resultingReleaseId}
                    </Link>
                  </>
                ) : null}
              </p>
            ) : (
              <p>Not triggered yet.</p>
            )}
          </div>
        </div>
      ))}

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Create rule</p>
        <Select
          value={metric}
          onValueChange={(value) => setMetric(parseMetric(value))}
        >
          <SelectTrigger aria-label={`Metric for ${target.platform}`}>
            <SelectValue placeholder="Metric" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={EngagementMetric.LIKES}>Likes</SelectItem>
            <SelectItem value={EngagementMetric.COMMENTS}>Comments</SelectItem>
            <SelectItem value={EngagementMetric.SHARES}>Shares</SelectItem>
            <SelectItem value={EngagementMetric.VIEWS}>Views</SelectItem>
            <SelectItem value={EngagementMetric.ENGAGEMENT_RATE}>
              Engagement rate
            </SelectItem>
          </SelectContent>
        </Select>
        <Input
          aria-label={`Threshold for ${target.platform}`}
          inputMode="decimal"
          label={`Threshold for ${target.platform}`}
          value={threshold}
          onChange={(event) => setThreshold(event.target.value)}
        />
        <Select
          value={actionType}
          onValueChange={(value) => setActionType(parseAction(value))}
        >
          <SelectTrigger aria-label={`Action for ${target.platform}`}>
            <SelectValue placeholder="Action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={EngagementRuleAction.REPOST}>Repost</SelectItem>
            <SelectItem value={EngagementRuleAction.FOLLOW_UP_COMMENT}>
              Follow-up comment
            </SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={mode}
          onValueChange={(value) => setMode(parseMode(value))}
        >
          <SelectTrigger aria-label={`Mode for ${target.platform}`}>
            <SelectValue placeholder="Mode" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={EngagementRuleMode.APPROVAL}>
              Approval
            </SelectItem>
            <SelectItem value={EngagementRuleMode.AUTO}>Auto</SelectItem>
          </SelectContent>
        </Select>
        <Switch
          aria-label={`Enable new rule for ${target.platform}`}
          isChecked={isEnabled}
          label="Enable rule"
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            setIsEnabled(event.target.checked);
          }}
        />
        <Button
          isDisabled={isSaving}
          isLoading={isSaving}
          label="Create rule"
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          onClick={() => {
            void handleCreate();
          }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Rules fire at most once per target.{' '}
        <Link className="underline" href={reconnectHref}>
          Reconnect accounts
        </Link>{' '}
        if a rule is ineligible.
      </p>
    </section>
  );
}
