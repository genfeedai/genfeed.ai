'use client';

import { ButtonVariant } from '@genfeedai/enums';
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

function formatNextRun(nextRunAt?: string | null): string | null {
  if (!nextRunAt) {
    return null;
  }
  const date = new Date(nextRunAt);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
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
            extractScheduleErrorMessage(cause, 'Failed to load the workflow'),
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
  }, [getService, isOpen, workflowId]);

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
      setError('Pick a cadence before saving the schedule.');
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
      setError(
        extractScheduleErrorMessage(cause, 'Failed to save the schedule'),
      );
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
      setError(
        extractScheduleErrorMessage(cause, 'Failed to remove the schedule'),
      );
    } finally {
      setIsSaving(false);
    }
  }, [getService, onOpenChange, onSaved, workflowId]);

  const cadenceSummary = describeCadence(cronExpression);
  const nextRunLabel = formatNextRun(nextRunAt);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="size-4" />
            Schedule workflow
          </DialogTitle>
          <DialogDescription>
            {workflowLabel
              ? `Run "${workflowLabel}" automatically on a recurring cadence.`
              : 'Run this workflow automatically on a recurring cadence.'}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="animate-pulse py-4 text-sm text-muted-foreground">
            Loading schedule…
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
                  Recurring schedule
                </p>
                <p className="text-xs leading-5 text-muted-foreground">
                  Run this workflow automatically on the cadence and timezone
                  below.
                </p>
              </div>
              <Switch
                aria-label="Recurring schedule"
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
                  Cadence
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
                    aria-label="Cadence"
                    id="workflow-schedule-cadence"
                  >
                    <SelectValue placeholder="Choose when to run" />
                  </SelectTrigger>
                  <SelectContent>
                    {WORKFLOW_SCHEDULE_PRESETS.map((preset) => (
                      <SelectItem key={preset.cron} value={preset.cron}>
                        {preset.label}
                      </SelectItem>
                    ))}
                    <SelectItem value={CUSTOM_CADENCE_VALUE}>
                      Custom…
                    </SelectItem>
                  </SelectContent>
                </Select>
                {isCustomCadence ? (
                  <div className="space-y-1.5 pt-2">
                    <label
                      className="block text-xs font-medium text-muted-foreground"
                      htmlFor="workflow-schedule-custom-cron"
                    >
                      Custom schedule
                    </label>
                    <Input
                      aria-label="Custom schedule"
                      disabled={isSaving}
                      id="workflow-schedule-custom-cron"
                      placeholder="e.g. weekdays at 9am → 0 9 * * 1-5"
                      value={cronExpression}
                      onChange={(event) =>
                        setCronExpression(event.target.value)
                      }
                    />
                    <p className="text-xs leading-5 text-muted-foreground">
                      Advanced cron format. Prefer a preset unless you need
                      something specific.
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <label
                  className="block text-sm font-medium text-foreground"
                  htmlFor="workflow-schedule-timezone"
                >
                  Timezone
                </label>
                <Select
                  disabled={isSaving}
                  value={timezone || 'UTC'}
                  onValueChange={setTimezone}
                >
                  <SelectTrigger
                    aria-label="Timezone"
                    id="workflow-schedule-timezone"
                  >
                    <SelectValue placeholder="Select timezone" />
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
                {isEnabled ? 'Runs' : 'Paused'} · {cadenceSummary} ·{' '}
                {timezone || 'UTC'}
                {nextRunLabel ? ` · Next run ${nextRunLabel}` : ''}
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
              Remove schedule
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
              Cancel
            </Button>
            <Button
              isDisabled={isSaving || isLoading}
              withWrapper={false}
              onClick={() => void handleSave()}
            >
              {isSaving ? 'Saving…' : 'Save schedule'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
