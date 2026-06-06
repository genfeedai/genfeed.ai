import type { BotSchema } from '@genfeedai/client/schemas';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';
import type { KeyboardEvent } from 'react';

type Settings = BotSchema['settings'];

type Props = {
  settings: Settings;
  isSubmitting: boolean;
  onSettingChange: (field: string, value: unknown) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  parseCommaSeparated: (value: string, stripPrefix?: string) => string[];
};

export default function ModalBotChatSettings({
  settings,
  isSubmitting,
  onSettingChange,
  onKeyDown,
  parseCommaSeparated,
}: Props) {
  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-lg">Chat Settings</h3>

      <FormControl label="Messages Per Minute">
        <Input
          type="number"
          value={settings.messagesPerMinute}
          onChange={(e) =>
            onSettingChange('messagesPerMinute', parseInt(e.target.value, 10))
          }
          min={1}
          max={60}
          disabled={isSubmitting}
        />
      </FormControl>

      <FormControl label="Response Delay (seconds)">
        <Input
          type="number"
          value={settings.responseDelaySeconds}
          onChange={(e) =>
            onSettingChange(
              'responseDelaySeconds',
              parseInt(e.target.value, 10),
            )
          }
          min={0}
          max={300}
          disabled={isSubmitting}
        />
      </FormControl>

      <FormControl label="Trigger Words (comma separated)">
        <Textarea
          name="triggers"
          value={(settings.triggers || []).join(', ')}
          onChange={(e) =>
            onSettingChange('triggers', parseCommaSeparated(e.target.value))
          }
          onKeyDown={onKeyDown}
          placeholder="e.g., hello, hi, hey"
          isDisabled={isSubmitting}
          className="h-16"
        />
      </FormControl>
    </div>
  );
}
