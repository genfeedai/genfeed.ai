import { PublishingFrequency } from '@genfeedai/enums';
import type { IPublishingBotSettings } from '@genfeedai/interfaces';
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

const PUBLISHING_FREQUENCIES = [
  { label: 'Hourly', value: PublishingFrequency.HOURLY },
  { label: 'Daily', value: PublishingFrequency.DAILY },
  { label: 'Weekly', value: PublishingFrequency.WEEKLY },
  { label: 'Custom Schedule', value: PublishingFrequency.CUSTOM },
] as const;

type Props = {
  publishingSettings: IPublishingBotSettings;
  isSubmitting: boolean;
  onSettingChange: (field: string, value: unknown) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  parseCommaSeparated: (value: string, stripPrefix?: string) => string[];
};

export default function ModalBotPublishingSettings({
  publishingSettings,
  isSubmitting,
  onSettingChange,
  onKeyDown,
  parseCommaSeparated,
}: Props) {
  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-lg">Publishing Settings</h3>

      <FormControl label="Content Source">
        <Select
          value={publishingSettings.contentSourceType}
          onValueChange={(value) => onSettingChange('contentSourceType', value)}
          disabled={isSubmitting}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="queue">Content Queue</SelectItem>
            <SelectItem value="template">Template</SelectItem>
            <SelectItem value="ai_generated">AI Generated</SelectItem>
          </SelectContent>
        </Select>
      </FormControl>

      {publishingSettings.contentSourceType === 'ai_generated' && (
        <FormControl label="AI Prompt">
          <Textarea
            name="aiPrompt"
            value={publishingSettings.aiPrompt || ''}
            onChange={(e) => onSettingChange('aiPrompt', e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Generate a tweet about…"
            isDisabled={isSubmitting}
            className="h-24"
          />
        </FormControl>
      )}

      <FormControl label="Publishing Frequency">
        <Select
          value={publishingSettings.frequency}
          onValueChange={(value) => onSettingChange('frequency', value)}
          disabled={isSubmitting}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PUBLISHING_FREQUENCIES.map(({ value, label }) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormControl>

      {publishingSettings.frequency === PublishingFrequency.CUSTOM && (
        <FormControl label="Custom Cron Expression">
          <Input
            type="text"
            name="customCronExpression"
            value={publishingSettings.customCronExpression || ''}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              onSettingChange('customCronExpression', e.target.value)
            }
            placeholder="0 */2 * * *"
            isDisabled={isSubmitting}
          />
        </FormControl>
      )}

      <FormControl label="Max Posts Per Day">
        <Input
          type="number"
          value={publishingSettings.maxPostsPerDay}
          onChange={(e) =>
            onSettingChange('maxPostsPerDay', parseInt(e.target.value, 10))
          }
          min={1}
          max={50}
          disabled={isSubmitting}
        />
      </FormControl>

      <FormControl label="Timezone">
        <Select
          value={publishingSettings.timezone}
          onValueChange={(value) => onSettingChange('timezone', value)}
          disabled={isSubmitting}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="UTC">UTC</SelectItem>
            <SelectItem value="America/New_York">Eastern Time (ET)</SelectItem>
            <SelectItem value="America/Chicago">Central Time (CT)</SelectItem>
            <SelectItem value="America/Denver">Mountain Time (MT)</SelectItem>
            <SelectItem value="America/Los_Angeles">
              Pacific Time (PT)
            </SelectItem>
            <SelectItem value="Europe/London">London (GMT)</SelectItem>
            <SelectItem value="Europe/Paris">Paris (CET)</SelectItem>
            <SelectItem value="Asia/Tokyo">Tokyo (JST)</SelectItem>
          </SelectContent>
        </Select>
      </FormControl>

      <FormControl label="Auto-Add Hashtags (comma separated)">
        <Textarea
          name="autoHashtags"
          value={(publishingSettings.autoHashtags || []).join(', ')}
          onChange={(e) =>
            onSettingChange(
              'autoHashtags',
              parseCommaSeparated(e.target.value, '#'),
            )
          }
          onKeyDown={onKeyDown}
          placeholder="e.g., AI, tech, startup"
          isDisabled={isSubmitting}
          className="h-16"
        />
      </FormControl>

      <FormControl label="Append Signature">
        <Input
          type="text"
          name="appendSignature"
          value={publishingSettings.appendSignature || ''}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            onSettingChange('appendSignature', e.target.value)
          }
          placeholder="e.g., - Sent via GenFeed"
          isDisabled={isSubmitting}
        />
      </FormControl>
    </div>
  );
}
