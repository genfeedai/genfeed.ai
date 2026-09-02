'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { TIMEZONES } from '@helpers/formatting/timezone/timezone.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { logger } from '@services/core/logger.service';
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
import { Switch } from '@ui/primitives/switch';
import { CalendarClock, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  type CloudWorkflowData,
  createWorkflowApiService,
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
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workflowLabel, setWorkflowLabel] = useState<string | null>(null);
  const [hasStoredSchedule, setHasStoredSchedule] = useState(false);
  const [nextRunAt, setNextRunAt] = useState<string | null>(null);
  const [cronExpression, setCronExpression] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [isEnabled, setIsEnabled] = useState(true);
  const [isCustomCadence, setIsCustomCadence] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const controller = new AbortController();

    const load = async (): Promise<void> => {
      setIsLoading(true);
      setError(null);

      try {
        const service = await getService();
        if (controller.signal.aborted) {
          return;
        }

        const workflow = await service.get(workflowId);
        if (controller.signal.aborted) {
          return;
        }

        const storedCron = workflow.schedule?.trim() ?? '';
        setWorkflowLabel(workflow.label);
        setHasStoredSchedule(Boolean(storedCron));
        setNextRunAt(workflow.nextRunAt ?? null);
        setCronExpression(storedCron);
        setTimezone(workflow.timezone?.trim() || 'UTC');
        setIsEnabled(storedCron ? (workflow.isScheduleEnabled ?? false) : true);
        setIsCustomCadence(
          resolveCadencePresetValue(storedCron) === CUSTOM_CADENCE_VALUE,
        );
      } catch (cause) {
        if (!controller.signal.aborted) {
          logger.error('Failed to load workflow schedule', {
            cause,
            workflowId,
          });
          setError(
            extractScheduleErrorMessage(cause, translate('errors.load')),
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    void load();
    return () => controller.abort();
  }, [getService, isOpen, translate, workflowId]);

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
      setError(translate('errors.cadenceRequired'));
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const service = await getService();
      const updated = await service.updateSchedule(workflowId, {
        isScheduleEnabled: isEnabled,
        schedule: trimmedCron,
        timezone: timezone.trim() || 'UTC',
      });
      onSaved?.(updated);
      onOpenChange(false);
    } catch (cause) {
      logger.error('Failed to save workflow schedule', { cause, workflowId });
      setError(extractScheduleErrorMessage(cause, translate('errors.save')));
    } finally {
      setIsSaving(false);
    }
  }, [
    cronExpression,
    getService,
    isEnabled,
    onOpenChange,
    onSaved,
    timezone,
    translate,
    workflowId,
  ]);

  const handleRemove = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    try {
      const service = await getService();
      const updated = await service.updateSchedule(workflowId, {
        isScheduleEnabled: false,
        schedule: null,
      });
      onSaved?.(updated);
      onOpenChange(false);
    } catch (cause) {
      logger.error('Failed to remove workflow schedule', {
        cause,
        workflowId,
      });
      setError(extractScheduleErrorMessage(cause, translate('errors.remove')));
    } finally {
      setIsSaving(false);
    }
  }, [getService, onOpenChange, onSaved, translate, workflowId]);

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
          <p className="animate-pulse py-4 text-sm text-muted-foreground">
            {translate('loading')}
          </p>
        ) : (
          <div className="space-y-4">
            {error ? (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <p>{error}</p>
              </div>
            ) : null}

            <div className="flex items-start justify-between gap-4 rounded-card bg-background-secondary/40 px-4 py-3 shadow-border">
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
                onCheckedChange={setIsEnabled}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label
                  className="block text-sm font-medium text-foreground"
                  htmlFor="workflow-schedule-cadence"
                >
                  {translate('cadence.label')}
                </label>
                <Select
                  disabled={isSaving}
                  value={cadenceSelectValue}
                  onValueChange={(value) => {
                    if (value === CUSTOM_CADENCE_VALUE) {
                      setIsCustomCadence(true);
                      if (!cronExpression.trim()) {
                        setCronExpression(DEFAULT_CUSTOM_CRON);
                      }
                      return;
                    }
                    setIsCustomCadence(false);
                    setCronExpression(value);
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
                    <label
                      className="block text-xs font-medium text-muted-foreground"
                      htmlFor="workflow-schedule-custom-cron"
                    >
                      {translate('custom.title')}
                    </label>
                    <Input
                      aria-label={translate('custom.title')}
                      disabled={isSaving}
                      id="workflow-schedule-custom-cron"
                      placeholder={translate('custom.placeholder')}
                      value={cronExpression}
                      onChange={(event) =>
                        setCronExpression(event.target.value)
                      }
                    />
                    <p className="text-xs leading-5 text-muted-foreground">
                      {translate('custom.description')}
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <label
                  className="block text-sm font-medium text-foreground"
                  htmlFor="workflow-schedule-timezone"
                >
                  {translate('timezone.label')}
                </label>
                <Select
                  disabled={isSaving}
                  value={timezone || 'UTC'}
                  onValueChange={setTimezone}
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
              isDisabled={isSaving || isLoading}
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
              isDisabled={isSaving || isLoading}
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
