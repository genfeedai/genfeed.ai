import type { HarnessStructureTabProps } from '@props/settings/harness.props';
import LazyRichTextEditor from '@ui/editors/LazyRichTextEditor';
import { Label } from '@ui/primitives/label';
import { useTranslations } from 'next-intl';
import {
  harnessEditorHtmlToLines,
  harnessLinesToEditorHtml,
} from './harness-content.helpers';

const STRUCTURE_FIELDS = [
  'shortFormSkeleton',
  'longFormSkeleton',
  'lineRules',
  'transitions',
  'endings',
] as const;

export default function HarnessStructureTab({
  draft,
  onListChange,
}: HarnessStructureTabProps) {
  const translate = useTranslations('pages.brandHarnessSettings.fields');

  return (
    <div className="flex max-w-none flex-col gap-6">
      {STRUCTURE_FIELDS.map((key) => (
        <div className="space-y-2" key={key}>
          <Label htmlFor={`harness-structure-${key}`}>
            {translate(`${key}.label`)}
          </Label>
          <p className="text-xs leading-5 text-muted-foreground">
            {translate(`${key}.helper`)}
          </p>
          <LazyRichTextEditor
            onChange={(html) =>
              onListChange('structure', key, harnessEditorHtmlToLines(html))
            }
            toolbarMode="minimal"
            value={harnessLinesToEditorHtml(draft.structure?.[key])}
          />
        </div>
      ))}
    </div>
  );
}
