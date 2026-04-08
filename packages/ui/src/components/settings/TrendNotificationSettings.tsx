'use client';

import type {
  ISetting,
  TrendNotificationFrequency,
} from '@genfeedai/interfaces';
import type { TrendNotificationSettingsProps } from '@props/settings/notifications.props';
import { Input } from '@ui/primitives/input';
import FormRange from '@ui/primitives/range-field';
import { SelectField } from '@ui/primitives/select';
import { Switch } from '@ui/primitives/switch';
import { useCallback, useState } from 'react';
import { HiBell, HiInformationCircle } from 'react-icons/hi2';

export type { TrendNotificationSettingsProps };

const FREQUENCY_OPTIONS: {
  value: TrendNotificationFrequency;
  label: string;
  description: string;
}[] = [
  {
    description: 'Get notified as soon as trends are detected',
    label: 'Real-time',
    value: 'realtime',
  },
  {
    description: 'Hourly digest of trending content',
    label: 'Hourly',
    value: 'hourly',
  },
  { description: 'Daily summary at 9 AM', label: 'Daily', value: 'daily' },
  {
    description: 'Weekly roundup every Monday',
    label: 'Weekly',
    value: 'weekly',
  },
];

export default function TrendNotificationSettings({
  settings,
  onUpdate,
  isLoading = false,
}: TrendNotificationSettingsProps) {
  const [isSaving, setIsSaving] = useState(false);

  const handleToggleChange = useCallback(
    async (field: keyof ISetting, checked: boolean) => {
      setIsSaving(true);
      try {
        await onUpdate({ [field]: checked });
      } finally {
        setIsSaving(false);
      }
    },
    [onUpdate],
  );

  const handleInputChange = useCallback(
    async (field: keyof ISetting, value: string | number) => {
      setIsSaving(true);
      try {
        await onUpdate({ [field]: value });
      } finally {
        setIsSaving(false);
      }
    },
    [onUpdate],
  );

  const isDisabled = isLoading || isSaving;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="p-2 bg-primary/10">
          <HiBell className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Trend Notifications</h3>
          <p className="text-sm text-muted-foreground">
            Get notified about viral trends matching your preferences
          </p>
        </div>
      </div>

      {/* Notification Channels */}
      <div className="space-y-4 p-4 border border-white/[0.08] bg-card">
        <h4 className="text-sm font-medium text-foreground">
          Notification Channels
        </h4>

        <div className="space-y-4">
          {/* In-App Notifications */}
          <Switch
            label="In-App Notifications"
            description="Receive trend alerts within the app"
            isChecked={settings.isTrendNotificationsInApp ?? true}
            isDisabled={isDisabled}
            onChange={(e) =>
              handleToggleChange('isTrendNotificationsInApp', e.target.checked)
            }
          />

          {/* Telegram Notifications */}
          <div className="space-y-2">
            <Switch
              label="Telegram Notifications"
              description="Get trend summaries via Telegram"
              isChecked={settings.isTrendNotificationsTelegram ?? false}
              isDisabled={isDisabled}
              onChange={(e) =>
                handleToggleChange(
                  'isTrendNotificationsTelegram',
                  e.target.checked,
                )
              }
            />

            {settings.isTrendNotificationsTelegram && (
              <div className="ml-8">
                <Input
                  name="trendNotificationsTelegramChatId"
                  placeholder="Enter your Telegram chat ID"
                  value={settings.trendNotificationsTelegramChatId ?? ''}
                  onChange={(e) =>
                    handleInputChange(
                      'trendNotificationsTelegramChatId',
                      e.target.value,
                    )
                  }
                  isDisabled={isDisabled}
                />
                <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                  <HiInformationCircle className="w-3 h-3" />
                  Message @userinfobot on Telegram to get your chat ID
                </p>
              </div>
            )}
          </div>

          {/* Email Notifications */}
          <div className="space-y-2">
            <Switch
              label="Email Notifications"
              description="Receive trend digests via email"
              isChecked={settings.isTrendNotificationsEmail ?? false}
              isDisabled={isDisabled}
              onChange={(e) =>
                handleToggleChange(
                  'isTrendNotificationsEmail',
                  e.target.checked,
                )
              }
            />

            {settings.isTrendNotificationsEmail && (
              <div className="ml-8">
                <Input
                  name="trendNotificationsEmailAddress"
                  placeholder="Enter email for trend notifications"
                  value={settings.trendNotificationsEmailAddress ?? ''}
                  onChange={(e) =>
                    handleInputChange(
                      'trendNotificationsEmailAddress',
                      e.target.value,
                    )
                  }
                  isDisabled={isDisabled}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Notification Preferences */}
      <div className="space-y-4 p-4 border border-white/[0.08] bg-card">
        <h4 className="text-sm font-medium text-foreground">Preferences</h4>

        {/* Frequency */}
        <div className="space-y-2">
          <SelectField
            name="trendNotificationsFrequency"
            label="Notification Frequency"
            value={settings.trendNotificationsFrequency ?? 'daily'}
            onChange={(e) =>
              handleInputChange(
                'trendNotificationsFrequency',
                e.target.value as TrendNotificationFrequency,
              )
            }
            isDisabled={isDisabled}
          >
            {FREQUENCY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label} - {opt.description}
              </option>
            ))}
          </SelectField>
        </div>

        {/* Minimum Viral Score */}
        <div className="space-y-2">
          <FormRange
            name="trendNotificationsMinViralScore"
            label={`Minimum Viral Score: ${settings.trendNotificationsMinViralScore ?? 70}`}
            min={0}
            max={100}
            step={5}
            value={settings.trendNotificationsMinViralScore ?? 70}
            onChange={(e) =>
              handleInputChange(
                'trendNotificationsMinViralScore',
                parseInt(e.target.value, 10),
              )
            }
            isDisabled={isDisabled}
          />
          <p className="text-xs text-muted-foreground">
            Only show trends with a viral score at or above this threshold.
            Higher values mean more selective, lower values mean more trends.
          </p>
        </div>
      </div>

      {/* Status indicator */}
      {isSaving && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Saving...
        </div>
      )}
    </div>
  );
}
