import type { HarnessThesisTabProps } from '@props/settings/harness.props';
import LazyRichTextEditor from '@ui/editors/LazyRichTextEditor';
import { Label } from '@ui/primitives/label';
import { useTranslations } from 'next-intl';
import {
  harnessEditorHtmlToLines,
  harnessLinesToEditorHtml,
} from './harness-content.helpers';

const THESIS_FIELDS = ['beliefs', 'enemies', 'offers', 'proofPoints'] as const;

export default function HarnessThesisTab({
  draft,
  onListChange,
}: HarnessThesisTabProps) {
  const translate = useTranslations('pages.brandHarnessSettings.fields');

  return (
    <div className="flex max-w-none flex-col gap-6">
      {THESIS_FIELDS.map((key) => (
        <div className="space-y-2" key={key}>
          <Label htmlFor={`harness-thesis-${key}`}>
            {translate(`${key}.label`)}
          </Label>
          <p className="text-xs leading-5 text-muted-foreground">
            {translate(`${key}.helper`)}
          </p>
          <LazyRichTextEditor
            onChange={(html) =>
              onListChange('thesis', key, harnessEditorHtmlToLines(html))
            }
            toolbarMode="minimal"
            value={harnessLinesToEditorHtml(draft.thesis?.[key])}
          />
        </div>
      ))}
    </div>
  );
}
