import { EngagementAction } from '@genfeedai/enums';
import type { IEngagementBotSettings } from '@genfeedai/interfaces';
import { Checkbox } from '@ui/primitives/checkbox';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';
import type { KeyboardEvent } from 'react';

const ENGAGEMENT_ACTIONS = [
  { label: 'Like', value: EngagementAction.LIKE },
  { label: 'Follow', value: EngagementAction.FOLLOW },
  { label: 'Retweet', value: EngagementAction.RETWEET },
  { label: 'Bookmark', value: EngagementAction.BOOKMARK },
] as const;

type Props = {
  engagementSettings: IEngagementBotSettings;
  isSubmitting: boolean;
  onArrayToggle: (
    settingsKey: 'engagementSettings',
    field: string,
    item: unknown,
    defaultSettings: { [key: string]: unknown[] },
  ) => void;
  onSettingChange: (field: string, value: unknown) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  parseCommaSeparated: (value: string, stripPrefix?: string) => string[];
};

export default function ModalBotEngagementSettings({
  engagementSettings,
  isSubmitting,
  onArrayToggle,
  onSettingChange,
  onKeyDown,
  parseCommaSeparated,
}: Props) {
  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-lg">Engagement Settings</h3>

      <FormControl label="Actions to Perform">
        <div className="flex flex-wrap gap-3">
          {ENGAGEMENT_ACTIONS.map(({ value, label }) => (
            <label
              key={value}
              className="flex items-center gap-2 cursor-pointer"
            >
              <Checkbox
                isChecked={engagementSettings.actions?.includes(value) ?? false}
                onCheckedChange={() =>
                  onArrayToggle('engagementSettings', 'actions', value, {
                    actions: [EngagementAction.LIKE],
                  })
                }
                isDisabled={isSubmitting}
              />
              <span className="text-sm">{label}</span>
            </label>
          ))}
        </div>
      </FormControl>

      <FormControl label="Target Keywords (comma separated)">
        <Textarea
          name="targetKeywords"
          value={(engagementSettings.targetKeywords || []).join(', ')}
          onChange={(e) =>
            onSettingChange(
              'targetKeywords',
              parseCommaSeparated(e.target.value),
            )
          }
          onKeyDown={onKeyDown}
          placeholder="e.g., AI, machine learning, tech"
          isDisabled={isSubmitting}
          className="h-16"
        />
      </FormControl>

      <FormControl label="Target Hashtags (comma separated)">
        <Textarea
          name="targetHashtags"
          value={(engagementSettings.targetHashtags || []).join(', ')}
          onChange={(e) =>
            onSettingChange(
              'targetHashtags',
              parseCommaSeparated(e.target.value, '#'),
            )
          }
          onKeyDown={onKeyDown}
          placeholder="e.g., AI, tech, innovation"
          isDisabled={isSubmitting}
          className="h-16"
        />
      </FormControl>

      <FormControl label="Target Accounts (comma separated)">
        <Textarea
          name="targetAccounts"
          value={(engagementSettings.targetAccounts || []).join(', ')}
          onChange={(e) =>
            onSettingChange(
              'targetAccounts',
              parseCommaSeparated(e.target.value, '@'),
            )
          }
          onKeyDown={onKeyDown}
          placeholder="e.g., elonmusk, OpenAI"
          isDisabled={isSubmitting}
          className="h-16"
        />
      </FormControl>

      <div className="grid grid-cols-2 gap-4">
        <FormControl label="Actions Per Hour">
          <Input
            type="number"
            value={engagementSettings.actionsPerHour}
            onChange={(e) =>
              onSettingChange('actionsPerHour', parseInt(e.target.value, 10))
            }
            min={1}
            max={100}
            disabled={isSubmitting}
          />
        </FormControl>

        <FormControl label="Actions Per Day">
          <Input
            type="number"
            value={engagementSettings.actionsPerDay}
            onChange={(e) =>
              onSettingChange('actionsPerDay', parseInt(e.target.value, 10))
            }
            min={1}
            max={1000}
            disabled={isSubmitting}
          />
        </FormControl>
      </div>

      <FormControl label="Delay Between Actions (seconds)">
        <Input
          type="number"
          value={engagementSettings.delayBetweenActions}
          onChange={(e) =>
            onSettingChange('delayBetweenActions', parseInt(e.target.value, 10))
          }
          min={5}
          max={300}
          disabled={isSubmitting}
        />
      </FormControl>

      <FormControl label="Only Verified Accounts">
        <Checkbox
          isChecked={engagementSettings.onlyVerified ?? false}
          onCheckedChange={(checked) =>
            onSettingChange('onlyVerified', checked === true)
          }
          isDisabled={isSubmitting}
          label={
            <span className="text-sm">Only engage with verified accounts</span>
          }
        />
      </FormControl>
    </div>
  );
}
