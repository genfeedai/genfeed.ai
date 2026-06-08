import { MonitoringAlertType } from '@genfeedai/enums';
import type { IMonitoringBotSettings } from '@genfeedai/interfaces';
import { Checkbox } from '@ui/primitives/checkbox';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import type { ChangeEvent, KeyboardEvent } from 'react';

const ALERT_TYPES = [
  { label: 'In-App', value: MonitoringAlertType.IN_APP },
  { label: 'Email', value: MonitoringAlertType.EMAIL },
  { label: 'Webhook', value: MonitoringAlertType.WEBHOOK },
  { label: 'Slack', value: MonitoringAlertType.SLACK },
] as const;

type Props = {
  monitoringSettings: IMonitoringBotSettings;
  isSubmitting: boolean;
  onArrayToggle: (
    settingsKey: 'monitoringSettings',
    field: string,
    item: unknown,
    defaultSettings: { [key: string]: unknown[] },
  ) => void;
  onSettingChange: (field: string, value: unknown) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  parseCommaSeparated: (value: string, stripPrefix?: string) => string[];
};

export default function ModalBotMonitoringSettings({
  monitoringSettings,
  isSubmitting,
  onArrayToggle,
  onSettingChange,
  onKeyDown,
  parseCommaSeparated,
}: Props) {
  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-lg">Monitoring Settings</h3>

      <FormControl label="Keywords to Monitor (comma separated)">
        <Textarea
          name="keywords"
          value={(monitoringSettings.keywords || []).join(', ')}
          onChange={(e) =>
            onSettingChange('keywords', parseCommaSeparated(e.target.value))
          }
          onKeyDown={onKeyDown}
          placeholder="e.g., brand name, competitor, product"
          isDisabled={isSubmitting}
          className="h-20"
        />
      </FormControl>

      <FormControl label="Hashtags to Monitor (comma separated)">
        <Textarea
          name="hashtags"
          value={(monitoringSettings.hashtags || []).join(', ')}
          onChange={(e) =>
            onSettingChange(
              'hashtags',
              parseCommaSeparated(e.target.value, '#'),
            )
          }
          onKeyDown={onKeyDown}
          placeholder="e.g., yourbrand, industry"
          isDisabled={isSubmitting}
          className="h-16"
        />
      </FormControl>

      <FormControl label="Exclude Keywords (comma separated)">
        <Textarea
          name="excludeKeywords"
          value={(monitoringSettings.excludeKeywords || []).join(', ')}
          onChange={(e) =>
            onSettingChange(
              'excludeKeywords',
              parseCommaSeparated(e.target.value),
            )
          }
          onKeyDown={onKeyDown}
          placeholder="e.g., spam, unrelated"
          isDisabled={isSubmitting}
          className="h-16"
        />
      </FormControl>

      <FormControl label="Alert Types">
        <div className="flex flex-wrap gap-3">
          {ALERT_TYPES.map(({ value, label }) => (
            <label
              key={value}
              className="flex items-center gap-2 cursor-pointer"
            >
              <Checkbox
                isChecked={
                  monitoringSettings.alertTypes?.includes(value) ?? false
                }
                onCheckedChange={() =>
                  onArrayToggle('monitoringSettings', 'alertTypes', value, {
                    alertTypes: [MonitoringAlertType.IN_APP],
                  })
                }
                isDisabled={isSubmitting}
              />
              <span className="text-sm">{label}</span>
            </label>
          ))}
        </div>
      </FormControl>

      {monitoringSettings.alertTypes?.includes(MonitoringAlertType.EMAIL) && (
        <FormControl label="Alert Email">
          <Input
            type="email"
            name="alertEmail"
            value={monitoringSettings.alertEmail || ''}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              onSettingChange('alertEmail', e.target.value)
            }
            placeholder="alerts@example.com"
            isDisabled={isSubmitting}
          />
        </FormControl>
      )}

      {monitoringSettings.alertTypes?.includes(MonitoringAlertType.WEBHOOK) && (
        <FormControl label="Webhook URL">
          <Input
            type="url"
            name="alertWebhookUrl"
            value={monitoringSettings.alertWebhookUrl || ''}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              onSettingChange('alertWebhookUrl', e.target.value)
            }
            placeholder="https://your-webhook.com/endpoint"
            isDisabled={isSubmitting}
          />
        </FormControl>
      )}

      {monitoringSettings.alertTypes?.includes(MonitoringAlertType.SLACK) && (
        <FormControl label="Slack Webhook URL">
          <Input
            type="url"
            name="alertSlackWebhookUrl"
            value={monitoringSettings.alertSlackWebhookUrl || ''}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              onSettingChange('alertSlackWebhookUrl', e.target.value)
            }
            placeholder="https://hooks.slack.com/services/…"
            isDisabled={isSubmitting}
          />
        </FormControl>
      )}

      <FormControl label="Alert Frequency">
        <Select
          value={monitoringSettings.alertFrequency}
          onValueChange={(value) => onSettingChange('alertFrequency', value)}
          disabled={isSubmitting}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="instant">Instant</SelectItem>
            <SelectItem value="hourly">Hourly Digest</SelectItem>
            <SelectItem value="daily">Daily Digest</SelectItem>
          </SelectContent>
        </Select>
      </FormControl>
    </div>
  );
}
