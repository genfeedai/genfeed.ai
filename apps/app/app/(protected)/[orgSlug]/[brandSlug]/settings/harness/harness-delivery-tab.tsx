import type { HarnessDeliveryTabProps } from '@props/settings/harness.props';
import LazyRichTextEditor from '@ui/editors/LazyRichTextEditor';
import { Input } from '@ui/primitives/input';
import { Label } from '@ui/primitives/label';
import { useTranslations } from 'next-intl';
import {
  harnessEditorHtmlToLines,
  harnessLinesToEditorHtml,
} from './harness-content.helpers';

const DELIVERY_SCALAR_FIELDS = [
  'tone',
  'style',
  'stance',
  'aggression',
  'sarcasm',
] as const;

export default function HarnessDeliveryTab({
  voice,
  onVoiceChange,
  splitLines,
}: HarnessDeliveryTabProps) {
  const translate = useTranslations('pages.brandHarnessSettings.fields');

  return (
    <div className="flex max-w-none flex-col gap-6">
      {DELIVERY_SCALAR_FIELDS.map((key) => (
        <div className="space-y-2" key={key}>
          <Label htmlFor={`harness-${key}`}>{translate(`${key}.label`)}</Label>
          <p className="text-xs leading-5 text-muted-foreground">
            {translate(`${key}.helper`)}
          </p>
          <Input
            id={`harness-${key}`}
            onChange={(event) => onVoiceChange(key, event.target.value)}
            value={(voice?.[key] as string | undefined) ?? ''}
          />
        </div>
      ))}

      <div className="space-y-2">
        <Label htmlFor="harness-vocabulary">
          {translate('vocabulary.label')}
        </Label>
        <p className="text-xs leading-5 text-muted-foreground">
          {translate('vocabulary.helper')}
        </p>
        <LazyRichTextEditor
          onChange={(html) =>
            onVoiceChange(
              'vocabulary',
              splitLines(harnessEditorHtmlToLines(html)),
            )
          }
          toolbarMode="minimal"
          value={harnessLinesToEditorHtml(voice?.vocabulary)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="harness-banned">
          {translate('bannedPhrases.label')}
        </Label>
        <p className="text-xs leading-5 text-muted-foreground">
          {translate('bannedPhrases.helper')}
        </p>
        <LazyRichTextEditor
          onChange={(html) =>
            onVoiceChange(
              'bannedPhrases',
              splitLines(harnessEditorHtmlToLines(html)),
            )
          }
          toolbarMode="minimal"
          value={harnessLinesToEditorHtml(voice?.bannedPhrases)}
        />
      </div>
    </div>
  );
}
