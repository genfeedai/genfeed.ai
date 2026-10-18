'use client';

import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type {
  AgentStrategyPublishPolicyUpdate,
  AgentStrategyPublishTogglesProps,
} from '@props/automation/agent-strategy-publish-toggles.props';
import { AgentStrategiesService } from '@services/automation/agent-strategies.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import { Checkbox } from '@ui/primitives/checkbox';
import { Progress } from '@ui/primitives/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import {
  approvalsToGraduateChoices,
  buildPlatformApprovalProgress,
  readApprovalsToGraduate,
} from './agent-publish-progress.helper';

/**
 * Earned auto-publish (#7338): the member opts the agent in and picks how many
 * pristine approvals a platform needs. Each platform then graduates on its own
 * streak; the server records graduation, this card only shows it.
 */
export default function AgentStrategyPublishToggles({
  agentId,
  onSaved,
  strategy,
}: AgentStrategyPublishTogglesProps) {
  const translate = useTranslations('common.automation.agentDetail.publishing');
  const getService = useAuthedService((token: string) =>
    AgentStrategiesService.getInstance(token),
  );
  const [pending, setPending] =
    useState<AgentStrategyPublishPolicyUpdate | null>(null);
  const publishPolicy = strategy.publishPolicy;
  const isAutoPublishEnabled =
    (pending?.autoPublishEnabled ?? publishPolicy?.autoPublishEnabled) === true;
  const requiredApprovals = readApprovalsToGraduate(
    pending?.autoPublishAfterApprovals ??
      publishPolicy?.autoPublishAfterApprovals,
  );
  const progress = useMemo(
    () =>
      buildPlatformApprovalProgress(
        strategy.platforms ?? [],
        publishPolicy?.platformStates,
      ),
    [publishPolicy?.platformStates, strategy.platforms],
  );

  const save = useCallback(
    async (update: AgentStrategyPublishPolicyUpdate) => {
      const notifications = NotificationsService.getInstance();
      setPending(update);
      try {
        const service = await getService();
        await service.update(agentId, { publishPolicy: update });
        await onSaved();
        notifications.success(translate('saved'));
      } catch (error) {
        logger.error('Failed to save agent publish policy', { error });
        notifications.error(translate('saveError'));
      } finally {
        setPending(null);
      }
    },
    [agentId, getService, onSaved, translate],
  );

  const isSaving = pending !== null;

  return (
    <Card
      className="space-y-4 p-4"
      description={translate('description', { requiredApprovals })}
      label={translate('title')}
      labelAs="h3"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="flex items-center gap-3 text-sm text-foreground">
          <Checkbox
            aria-label={translate('enable')}
            checked={isAutoPublishEnabled}
            isDisabled={isSaving}
            onCheckedChange={(checked) =>
              void save({ autoPublishEnabled: checked === true })
            }
          />
          {translate('enable')}
        </span>
        <span className="flex items-center gap-2 text-sm text-foreground">
          {translate('threshold')}
          <Select
            disabled={isSaving}
            value={String(requiredApprovals)}
            onValueChange={(value) =>
              void save({ autoPublishAfterApprovals: Number(value) })
            }
          >
            <SelectTrigger aria-label={translate('threshold')} className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {approvalsToGraduateChoices(requiredApprovals).map((choice) => (
                <SelectItem key={choice} value={String(choice)}>
                  {choice}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </span>
      </div>

      <section
        aria-label={translate('progressTitle')}
        className="flex flex-col gap-3 border-t border-foreground/10 pt-3"
      >
        <p className="text-sm font-medium text-foreground">
          {translate('progressTitle')}
        </p>
        {progress.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {translate('choosePlatform')}
          </p>
        ) : (
          <ul className="flex flex-col gap-3 text-sm">
            {progress.map((row) => (
              <li key={row.platform} className="flex flex-col gap-1.5">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-foreground">
                    {row.label}
                  </span>
                  <span className="text-muted-foreground">
                    {translate('approvalStreak', {
                      count: row.approvalStreak,
                      requiredApprovals,
                    })}
                  </span>
                  <Badge variant={row.isGraduated ? 'success' : 'secondary'}>
                    {row.isGraduated
                      ? translate('graduated')
                      : translate('reviewRequired')}
                  </Badge>
                </span>
                <Progress
                  aria-label={translate('approvalStreakLabel', {
                    platform: row.label,
                  })}
                  value={Math.min(
                    100,
                    (row.approvalStreak / requiredApprovals) * 100,
                  )}
                />
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          {translate('graduationRequirements')}
        </p>
        {!isAutoPublishEnabled && (
          <p className="text-sm text-muted-foreground">{translate('off')}</p>
        )}
      </section>
    </Card>
  );
}
