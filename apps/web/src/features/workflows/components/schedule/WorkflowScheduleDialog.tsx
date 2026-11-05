'use client';

import {
  ButtonVariant,
  CardGap,
  CardPadding,
  ComponentSize,
} from '@genfeedai/contracts';
import { TIMEZONES } from '@helpers/formatting/timezone/timezone.helper';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { logger } from '@services/core/logger.service';
import { useQueryClient } from '@tanstack/react-query';
import Card from '@ui/card/Card';
import { Alert } from '@ui/primitives/alert';
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
import { Label } from '@ui/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import Spinner from '@ui/primitives/spinner';
import { Switch } from '@ui/primitives/switch';
import { CalendarClock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';

import {
  type CloudWorkflowData,
  createWorkflowApiService,
  type WorkflowApiService,
} from '@/features/workflows/services/workflow-api';
import {
  CUSTOM_CADENCE_VALUE,
  DEFAULT_CUSTOM_CRON,
  describeCadence,
  extractScheduleErrorMessage,
  formatNextRunAt,
  resolveCadencePresetValue,
  WORKFLOW_SCHEDULE_PRESETS,
} from './schedule-cadence';

interface WorkflowScheduleDialogProps {
  readonly isOpen: boolean;
  readonly onOpenChange: (isOpen: boolean) => void;
  /** Called with the updated workflow after a successful save or removal. */
  readonly onSaved?: (workflow: CloudWorkflowData) => void;
  readonly workflowId: string;
}

/** What the dialog edits; seeded from the stored schedule. */
interface ScheduleFormState {
  cronExpression: string;
  isCustomCadence: boolean;
  isEnabled: boolean;
  timezone: string;
}

function workflowScheduleQueryKey(workflowId: string) {
  return ['workflow-schedule', workflowId] as const;
}

function toScheduleForm(workflow: CloudWorkflowData | null): ScheduleFormState {
  const storedCron = workflow?.schedule?.trim() ?? '';
  return {
    cronExpression: storedCron,
    isCustomCadence:
      resolveCadencePresetValue(storedCron) === CUSTOM_CADENCE_VALUE,
    isEnabled: storedCron ? (workflow?.isScheduleEnabled ?? false) : true,
    timezone: workflow?.timezone?.trim() || 'UTC',
  };
}

function isSameScheduleForm(
  a: ScheduleFormState,
  b: ScheduleFormState,
): boolean {
  return (
    a.cronExpression === b.cronExpression &&
    a.isCustomCadence === b.isCustomCadence &&
    a.isEnabled === b.isEnabled &&
    a.timezone === b.timezone
  );
}

/**
 * Set, edit, enable, disable, or remove the recurring schedule of a
 * user-owned workflow. Presets translate to canonical cron without exposing
 * cron syntax; advanced mode accepts a custom expression which the backend
 * validates in the merged timezone before anything persists (#2661).
 */
export function WorkflowScheduleDialog({
  isOpen,
  onOpenChange,
  onSaved,
  workflowId,
}: WorkflowScheduleDialogProps) {
  const translate = useTranslations('common.automation.workflows.schedule');
  const getService = useAuthedService(createWorkflowApiService);
  const queryClient = useQueryClient();
  // The stored schedule reads through React Query, so reopening the dialog
  // paints the cached schedule at once and refreshes it in the background.
  const workflowQuery = useAuthedQuery<WorkflowApiService, CloudWorkflowData>({
    enabled: isOpen,
    queryFn: async (service) => {
      try {
        return await service.get(workflowId);
      } catch (cause) {
        logger.error('Failed to load workflow schedule', {
          cause,
          workflowId,
        });
        throw cause;
      }
    },
    queryKey: workflowScheduleQueryKey(workflowId),
    // The schedule can change outside this dialog (the library's pause
    // toggle), so every open re-reads it behind the cached paint.
    refetchOnMount: 'always',
    service: createWorkflowApiService,
  });
  const workflow = workflowQuery.data ?? null;
  const isLoading = isOpen && workflowQuery.isPending;
  // A save sends the whole schedule, so it waits for the fresh read rather
  // than writing back a cached one.
  const isRefreshing = workflowQuery.isFetching;
  const hasStoredSchedule = Boolean(workflow?.schedule?.trim());
  const workflowLabel = workflow?.label ?? null;
  const nextRunAt = workflow?.nextRunAt ?? null;

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const error =
    saveError ??
    (workflowQuery.error
      ? extractScheduleErrorMessage(
          workflowQuery.error,
          translate('errors.load'),
        )
      : null);

  const [form, setForm] = useState<ScheduleFormState>(() =>
    toScheduleForm(workflow),
  );
  // The workflow the form was last seeded from. A fresh read re-seeds the
  // form only while it is untouched, so a background refresh never wipes a
  // cadence the user is choosing.
  const [formSource, setFormSource] = useState(workflow);
  if (formSource !== workflow) {
    setFormSource(workflow);
    if (isSameScheduleForm(form, toScheduleForm(formSource))) {
      setForm(toScheduleForm(workflow));
    }
  }
  const { cronExpression, isCustomCadence, isEnabled, timezone } = form;
  const updateForm = useCallback((update: Partial<ScheduleFormState>) => {
    setForm((current) => ({ ...current, ...update }));
  }, []);

  const applySavedWorkflow = useCallback(
    (updated: CloudWorkflowData) => {
      queryClient.setQueriesData<CloudWorkflowData>(
        { queryKey: workflowScheduleQueryKey(workflowId) },
        updated,
      );
      onSaved?.(updated);
      onOpenChange(false);
    },
    [onOpenChange, onSaved, queryClient, workflowId],
  );

  const cadenceSelectValue = isCustomCadence
    ? CUSTOM_CADENCE_VALUE
    : resolveCadencePresetValue(cronExpression) || undefined;

  const timezoneOptions = useMemo(() => {
    if (!timezone || TIMEZONES.some((entry) => entry.value === timezone)) {
      return TIMEZONES;
    }
    return [{ label: timezone, offset: 0, value: timezone }, ...TIMEZONES];
  }, [timezone]);

  const handleSave = useCallback(async () => {
    const trimmedCron = cronExpression.trim();
    if (!trimmedCron) {
      setSaveError(translate('errors.cadenceRequired'));
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    try {
      const service = await getService();
      const updated = await service.updateSchedule(workflowId, {
        isScheduleEnabled: isEnabled,
        schedule: trimmedCron,
        timezone: timezone.trim() || 'UTC',
      });
      applySavedWorkflow(updated);
    } catch (cause) {
      logger.error('Failed to save workflow schedule', { cause, workflowId });
      setSaveError(
        extractScheduleErrorMessage(cause, translate('errors.save')),
      );
    } finally {
      setIsSaving(false);
    }
  }, [
    applySavedWorkflow,
    cronExpression,
    getService,
    isEnabled,
    timezone,
    translate,
    workflowId,
  ]);

  const handleRemove = useCallback(async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const service = await getService();
      const updated = await service.updateSchedule(workflowId, {
        isScheduleEnabled: false,
        schedule: null,
      });
      applySavedWorkflow(updated);
    } catch (cause) {
      logger.error('Failed to remove workflow schedule', {
        cause,
        workflowId,
      });
      setSaveError(
        extractScheduleErrorMessage(cause, translate('errors.remove')),
      );
    } finally {
      setIsSaving(false);
    }
  }, [applySavedWorkflow, getService, translate, workflowId]);

  const cadenceSummary = describeCadence(cronExpression);
  const nextRunLabel = formatNextRunAt(nextRunAt, timezone);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="size-4" />
            {translate('title')}
          </DialogTitle>
          <DialogDescription>
            {workflowLabel
              ? translate('descriptionNamed', { workflow: workflowLabel })
              : translate('description')}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Spinner aria-hidden="true" size={ComponentSize.SM} />
            {translate('loading')}
          </p>
        ) : (
          <div className="space-y-4">
            {error ? (
              <Alert size="sm" variant="destructive">
                {error}
              </Alert>
            ) : null}

            <Card
              padding={CardPadding.SM}
              gap={CardGap.LG}
              bodyClassName="flex-row items-start justify-between"
            >
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-medium text-foreground">
                  {translate('recurring.title')}
                </p>
                <p className="text-xs leading-5 text-muted-foreground">
                  {translate('recurring.description')}
                </p>
              </div>
              <Switch
                aria-label={translate('recurring.title')}
                className="mt-0.5 shrink-0"
                checked={isEnabled}
                onCheckedChange={(checked) =>
                  updateForm({ isEnabled: checked })
                }
              />
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label
                  className="text-foreground"
                  htmlFor="workflow-schedule-cadence"
                >
                  {translate('cadence.label')}
                </Label>
                <Select
                  disabled={isSaving}
                  value={cadenceSelectValue}
                  onValueChange={(value) => {
                    if (value === CUSTOM_CADENCE_VALUE) {
                      updateForm(
                        cronExpression.trim()
                          ? { isCustomCadence: true }
                          : {
                              cronExpression: DEFAULT_CUSTOM_CRON,
                              isCustomCadence: true,
                            },
                      );
                      return;
                    }
                    updateForm({
                      cronExpression: value,
                      isCustomCadence: false,
                    });
                  }}
                >
                  <SelectTrigger
                    aria-label={translate('cadence.label')}
                    id="workflow-schedule-cadence"
                  >
                    <SelectValue
                      placeholder={translate('cadence.placeholder')}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {WORKFLOW_SCHEDULE_PRESETS.map((preset) => (
                      <SelectItem key={preset.cron} value={preset.cron}>
                        {preset.label}
                      </SelectItem>
                    ))}
                    <SelectItem value={CUSTOM_CADENCE_VALUE}>
                      {translate('cadence.custom')}
                    </SelectItem>
                  </SelectContent>
                </Select>
                {isCustomCadence ? (
                  <div className="space-y-1.5 pt-2">
                    <Label
                      className="text-xs text-muted-foreground"
                      htmlFor="workflow-schedule-custom-cron"
                    >
                      {translate('custom.title')}
                    </Label>
                    <Input
                      aria-label={translate('custom.title')}
                      disabled={isSaving}
                      id="workflow-schedule-custom-cron"
                      placeholder={translate('custom.placeholder')}
                      value={cronExpression}
                      onChange={(event) =>
                        updateForm({ cronExpression: event.target.value })
                      }
                    />
                    <p className="text-xs leading-5 text-muted-foreground">
                      {translate('custom.description')}
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label
                  className="text-foreground"
                  htmlFor="workflow-schedule-timezone"
                >
                  {translate('timezone.label')}
                </Label>
                <Select
                  disabled={isSaving}
                  value={timezone || 'UTC'}
                  onValueChange={(value) => updateForm({ timezone: value })}
                >
                  <SelectTrigger
                    aria-label={translate('timezone.label')}
                    id="workflow-schedule-timezone"
                  >
                    <SelectValue
                      placeholder={translate('timezone.placeholder')}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {timezoneOptions.map((entry) => (
                      <SelectItem key={entry.value} value={entry.value}>
                        {entry.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {cadenceSummary ? (
              <p className="text-xs text-muted-foreground">
                {isEnabled ? translate('runs') : translate('paused')} ·{' '}
                {cadenceSummary} · {timezone || 'UTC'}
                {nextRunLabel
                  ? ` · ${translate('nextRun', { nextRun: nextRunLabel })}`
                  : ''}
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter className="sm:justify-between">
          {hasStoredSchedule ? (
            <Button
              isDisabled={isSaving || isLoading || isRefreshing}
              variant={ButtonVariant.DESTRUCTIVE}
              withWrapper={false}
              onClick={() => void handleRemove()}
            >
              {translate('actions.remove')}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button
              isDisabled={isSaving}
              variant={ButtonVariant.SECONDARY}
              withWrapper={false}
              onClick={() => onOpenChange(false)}
            >
              {translate('actions.cancel')}
            </Button>
            <Button
              isDisabled={isSaving || isLoading || isRefreshing}
              withWrapper={false}
              onClick={() => void handleSave()}
            >
              {isSaving
                ? translate('actions.saving')
                : translate('actions.save')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
