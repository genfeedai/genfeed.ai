import type { HarnessIdentityTabProps } from '@props/settings/harness.props';
import LazyRichTextEditor from '@ui/editors/LazyRichTextEditor';
import { Input } from '@ui/primitives/input';
import { Label } from '@ui/primitives/label';
import { useTranslations } from 'next-intl';
import {
  harnessEditorHtmlToLines,
  harnessLinesToEditorHtml,
} from './harness-content.helpers';

export default function HarnessIdentityTab({
  draft,
  onDraftChange,
  splitLines,
}: HarnessIdentityTabProps) {
  const translate = useTranslations('pages.brandHarnessSettings.fields');

  return (
    <div className="flex max-w-none flex-col gap-6">
      <div className="space-y-2">
        <Label htmlFor="harness-label">{translate('label.label')}</Label>
        <p className="text-xs leading-5 text-muted-foreground">
          {translate('label.helper')}
        </p>
        <Input
          id="harness-label"
          onChange={(event) => onDraftChange('label', event.target.value)}
          value={draft.label}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="harness-scope">{translate('scope.label')}</Label>
        <p className="text-xs leading-5 text-muted-foreground">
          {translate('scope.helper')}
        </p>
        <Input disabled id="harness-scope" value={draft.scope ?? 'brand'} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="harness-description">
          {translate('description.label')}
        </Label>
        <p className="text-xs leading-5 text-muted-foreground">
          {translate('description.helper')}
        </p>
        <Input
          id="harness-description"
          onChange={(event) => onDraftChange('description', event.target.value)}
          value={draft.description ?? ''}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="harness-platforms">
          {translate('platforms.label')}
        </Label>
        <p className="text-xs leading-5 text-muted-foreground">
          {translate('platforms.helper')}
        </p>
        <LazyRichTextEditor
          onChange={(html) =>
            onDraftChange(
              'platforms',
              splitLines(harnessEditorHtmlToLines(html)),
            )
          }
          toolbarMode="minimal"
          value={harnessLinesToEditorHtml(draft.platforms)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="harness-audience">{translate('audience.label')}</Label>
        <p className="text-xs leading-5 text-muted-foreground">
          {translate('audience.helper')}
        </p>
        <LazyRichTextEditor
          onChange={(html) =>
            onDraftChange(
              'audience',
              splitLines(harnessEditorHtmlToLines(html)),
            )
          }
          toolbarMode="minimal"
          value={harnessLinesToEditorHtml(draft.audience)}
        />
      </div>
    </div>
  );
}
