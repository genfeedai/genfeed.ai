'use client';

import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/enums';
import { resolveAuthToken } from '@genfeedai/helpers/auth/auth.helper';
import { formatRecurringSchedule } from '@genfeedai/helpers/formatting/recurring-schedule/recurring-schedule.helper';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import Badge from '@ui/display/badge/Badge';
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
import { useCallback, useId, useState } from 'react';
import {
  HiOutlineCalendar,
  HiOutlineChevronDown,
  HiOutlineChevronUp,
  HiOutlineClock,
} from 'react-icons/hi2';

interface SchedulePanelProps {
  workflowId: string;
  currentSchedule?: string;
  currentTimezone?: string;
  isEnabled?: boolean;
  onScheduleUpdate?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

const PRESET_SCHEDULES = [
  { cron: '0 * * * *', label: 'Every hour' },
  { cron: '0 */6 * * *', label: 'Every 6 hours' },
  { cron: '0 9 * * *', label: 'Daily at 9am' },
  { cron: '0 18 * * *', label: 'Daily at 6pm' },
  { cron: '0 9 * * 1', label: 'Weekly (Monday 9am)' },
  { cron: '0 9,18 * * *', label: 'Twice daily (9am, 6pm)' },
];

const TIMEZONES = [
  { label: 'UTC', value: 'UTC' },
  { label: 'Eastern (New York)', value: 'America/New_York' },
  { label: 'Central (Chicago)', value: 'America/Chicago' },
  { label: 'Mountain (Denver)', value: 'America/Denver' },
  { label: 'Pacific (Los Angeles)', value: 'America/Los_Angeles' },
  { label: 'London', value: 'Europe/London' },
  { label: 'Paris', value: 'Europe/Paris' },
  { label: 'Tokyo', value: 'Asia/Tokyo' },
  { label: 'Shanghai', value: 'Asia/Shanghai' },
  { label: 'Sydney', value: 'Australia/Sydney' },
];

export default function SchedulePanel({
  workflowId,
  currentSchedule,
  currentTimezone = 'UTC',
  isEnabled = false,
  onScheduleUpdate,
  isCollapsed = false,
  onToggleCollapse,
}: SchedulePanelProps) {
  const { getToken } = useAuthIdentity();
  const enableScheduleId = useId();
  const cronExpressionId = useId();
  const timezoneId = useId();
  const [schedule, setSchedule] = useState(currentSchedule || '');
  const [timezone, setTimezone] = useState(currentTimezone);
  const [enabled, setEnabled] = useState(isEnabled);
  const [isCustom, setIsCustom] = useState(
    !PRESET_SCHEDULES.some((p) => p.cron === currentSchedule),
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveSchedule = useCallback(async () => {
    if (!schedule) {
      NotificationsService.getInstance().error('Please select a schedule');
      return;
    }

    try {
      setIsSaving(true);
      const token = await resolveAuthToken(getToken);
      const response = await fetch(
        `${EnvironmentService.apiEndpoint}/workflows/${workflowId}/schedule`,
        {
          body: JSON.stringify({
            enabled,
            schedule,
            timezone,
          }),
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          method: 'POST',
        },
      );

      if (!response.ok) {
        throw new Error('Failed to save schedule');
      }

      NotificationsService.getInstance().success('Schedule saved');
      onScheduleUpdate?.();
    } catch (_err) {
      NotificationsService.getInstance().error('Failed to save schedule');
    } finally {
      setIsSaving(false);
    }
  }, [workflowId, schedule, timezone, enabled, onScheduleUpdate, getToken]);

  const handleRemoveSchedule = useCallback(async () => {
    try {
      setIsSaving(true);
      const token = await resolveAuthToken(getToken);
      const response = await fetch(
        `${EnvironmentService.apiEndpoint}/workflows/${workflowId}/schedule`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          method: 'DELETE',
        },
      );

      if (!response.ok) {
        throw new Error('Failed to remove schedule');
      }

      setSchedule('');
      setEnabled(false);
      NotificationsService.getInstance().success('Schedule removed');
      onScheduleUpdate?.();
    } catch (_err) {
      NotificationsService.getInstance().error('Failed to remove schedule');
    } finally {
      setIsSaving(false);
    }
  }, [workflowId, onScheduleUpdate, getToken]);

  return (
    <div className="border-b border-white/[0.08]">
      <div
        role="button"
        tabIndex={0}
        className="flex cursor-pointer items-center justify-between px-4 py-3"
        onClick={onToggleCollapse}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleCollapse?.();
          }
        }}
      >
        <div className="flex items-center gap-2">
          <HiOutlineClock className="size-4" />
          <span className="font-semibold text-sm">Schedule</span>
        </div>
        <div className="flex items-center gap-2">
          {schedule && enabled && (
            <Badge variant="success" size={ComponentSize.SM}>
              Active
            </Badge>
          )}
          {isCollapsed ? (
            <HiOutlineChevronDown className="size-4" />
          ) : (
            <HiOutlineChevronUp className="size-4" />
          )}
        </div>
      </div>

      {!isCollapsed && (
        <div className="p-4 pt-0 space-y-4">
          {/* Current schedule info */}
          {schedule && (
            <div className="flex items-center gap-2 p-2 bg-background">
              <HiOutlineCalendar className="size-4" />
              <span className="text-sm">
                {formatRecurringSchedule(schedule, timezone)}
              </span>
              <span className="text-xs opacity-60">({timezone})</span>
            </div>
          )}

          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <label htmlFor={enableScheduleId} className="text-sm">
              Enable Schedule
            </label>
            <Switch
              id={enableScheduleId}
              checked={enabled}
              onCheckedChange={setEnabled}
              aria-label="Enable workflow schedule"
            />
          </div>

          {/* Preset or Custom toggle */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant={!isCustom ? ButtonVariant.DEFAULT : ButtonVariant.GHOST}
              size={ButtonSize.SM}
              className="flex-1"
              onClick={() => setIsCustom(false)}
              label="Preset"
            />
            <Button
              type="button"
              variant={isCustom ? ButtonVariant.DEFAULT : ButtonVariant.GHOST}
              size={ButtonSize.SM}
              className="flex-1"
              onClick={() => setIsCustom(true)}
              label="Custom"
            />
          </div>

          {/* Schedule selection */}
          {isCustom ? (
            <div>
              <label htmlFor={cronExpressionId} className="text-xs font-medium">
                Cron Expression
              </label>
              <Input
                id={cronExpressionId}
                type="text"
                className="mt-1 h-8"
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
                placeholder="0 9 * * *"
              />
              <p className="text-xs opacity-60 mt-1">
                Format: minute hour day month weekday
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {PRESET_SCHEDULES.map((preset) => (
                <Button
                  key={preset.cron}
                  type="button"
                  variant={
                    schedule === preset.cron
                      ? ButtonVariant.DEFAULT
                      : ButtonVariant.GHOST
                  }
                  size={ButtonSize.SM}
                  onClick={() => setSchedule(preset.cron)}
                  label={preset.label}
                />
              ))}
            </div>
          )}

          {/* Timezone */}
          <div>
            <label htmlFor={timezoneId} className="text-xs font-medium">
              Timezone
            </label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger id={timezoneId} className="mt-1 h-8">
                <SelectValue placeholder="Select a timezone" />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            {schedule && (
              <Button
                type="button"
                variant={ButtonVariant.GHOST}
                size={ButtonSize.SM}
                className="flex-1"
                onClick={handleRemoveSchedule}
                isDisabled={isSaving}
                label="Remove"
              />
            )}
            <Button
              type="button"
              variant={ButtonVariant.DEFAULT}
              size={ButtonSize.SM}
              className="flex-1"
              onClick={handleSaveSchedule}
              isDisabled={isSaving || !schedule}
              isLoading={isSaving}
              label="Save Schedule"
            />
          </div>
        </div>
      )}
    </div>
  );
}
