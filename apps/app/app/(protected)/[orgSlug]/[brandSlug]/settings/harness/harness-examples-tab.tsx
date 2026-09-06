import type { HarnessExamplesTabProps } from '@props/settings/harness.props';
import LazyRichTextEditor from '@ui/editors/LazyRichTextEditor';
import { Label } from '@ui/primitives/label';
import { useTranslations } from 'next-intl';
import {
  harnessEditorHtmlToLines,
  harnessLinesToEditorHtml,
} from './harness-content.helpers';

export default function HarnessExamplesTab({
  draft,
  onListChange,
  onDraftChange,
  splitLines,
}: HarnessExamplesTabProps) {
  const translate = useTranslations('pages.brandHarnessSettings.fields');

  return (
    <div className="flex max-w-none flex-col gap-6">
      <div className="space-y-2">
        <Label htmlFor="harness-good">{translate('good.label')}</Label>
        <p className="text-xs leading-5 text-muted-foreground">
          {translate('good.helper')}
        </p>
        <LazyRichTextEditor
          onChange={(html) =>
            onListChange('examples', 'good', harnessEditorHtmlToLines(html))
          }
          toolbarMode="minimal"
          value={harnessLinesToEditorHtml(draft.examples?.good)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="harness-avoid">{translate('avoid.label')}</Label>
        <p className="text-xs leading-5 text-muted-foreground">
          {translate('avoid.helper')}
        </p>
        <LazyRichTextEditor
          onChange={(html) =>
            onListChange('examples', 'avoid', harnessEditorHtmlToLines(html))
          }
          toolbarMode="minimal"
          value={harnessLinesToEditorHtml(draft.examples?.avoid)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="harness-guardrails">
          {translate('guardrails.label')}
        </Label>
        <p className="text-xs leading-5 text-muted-foreground">
          {translate('guardrails.helper')}
        </p>
        <LazyRichTextEditor
          onChange={(html) =>
            onDraftChange(
              'guardrails',
              splitLines(harnessEditorHtmlToLines(html)),
            )
          }
          toolbarMode="minimal"
          value={harnessLinesToEditorHtml(draft.guardrails)}
        />
      </div>
    </div>
  );
}
