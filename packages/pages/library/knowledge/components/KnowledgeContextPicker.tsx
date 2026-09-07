'use client';

import {
  ButtonVariant,
  KnowledgeProcessingState,
  KnowledgeSourcePurpose,
} from '@genfeedai/contracts';
import type { KnowledgeSelection } from '@genfeedai/contracts/interfaces';
import { useKnowledgeLibrary } from '@pages/library/knowledge/hooks/use-knowledge-library';
import type { KnowledgeContextPickerProps } from '@props/content/knowledge-library.props';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { BookOpen } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

/** Passages the harness folds in for an explicit selection, ~500 chars each. */
const SELECTED_PASSAGE_BUDGET = 8;
const CHARS_PER_PASSAGE = 500;
const CHARS_PER_TOKEN = 4;

/** Keys resolve under `pages.library.knowledge.purpose`. */
const PURPOSE_KEY: Record<KnowledgeSourcePurpose, string> = {
  [KnowledgeSourcePurpose.BRAND_TRUTH]: 'brandTruth',
  [KnowledgeSourcePurpose.INSPIRATION]: 'inspiration',
  [KnowledgeSourcePurpose.RESEARCH]: 'research',
};

export function countKnowledgeSelection(selection: KnowledgeSelection): number {
  return (
    (selection.sourceIds?.length ?? 0) +
    (selection.spaceIds?.length ?? 0) +
    (selection.purposes?.length ?? 0)
  );
}

/** Rough upper bound on prompt tokens the selection can add. */
export function estimateKnowledgeTokens(selection: KnowledgeSelection): number {
  if (countKnowledgeSelection(selection) === 0) {
    return 0;
  }
  return Math.round(
    (SELECTED_PASSAGE_BUDGET * CHARS_PER_PASSAGE) / CHARS_PER_TOKEN,
  );
}

function toggle(list: string[] | undefined, id: string): string[] {
  const current = list ?? [];
  return current.includes(id)
    ? current.filter((item) => item !== id)
    : [...current, id];
}

export default function KnowledgeContextPicker({
  brandId,
  onChange,
  value,
}: KnowledgeContextPickerProps) {
  const translate = useTranslations('pages.library.knowledge.picker');
  const translatePurpose = useTranslations('pages.library.knowledge.purpose');
  const { isLoading, rows, spaces } = useKnowledgeLibrary({ brandId });
  const readyRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          row.source.isVisible &&
          row.version?.processingState === KnowledgeProcessingState.READY,
      ),
    [rows],
  );
  const selectedCount = countKnowledgeSelection(value);
  const tokenEstimate = estimateKnowledgeTokens(value);

  if (!brandId) {
    return null;
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2 px-2 pt-2"
      data-testid="knowledge-context-picker"
    >
      <Popover>
        <PopoverTrigger asChild>
          <Button
            icon={<BookOpen className="size-4" />}
            label={
              selectedCount > 0
                ? translate('selectedLabel', { count: selectedCount })
                : translate('label')
            }
            variant={ButtonVariant.SECONDARY}
          />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80">
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-sm font-semibold">{translate('title')}</p>
              <p className="text-xs text-muted-foreground">
                {translate('description')}
              </p>
            </div>
            <fieldset className="flex flex-col gap-1">
              <legend className="text-2xs font-bold uppercase tracking-wide text-muted-foreground">
                {translate('purposes')}
              </legend>
              {Object.values(KnowledgeSourcePurpose).map((purpose) => (
                <label
                  className="flex items-center gap-2 text-sm"
                  key={purpose}
                >
                  <Checkbox
                    aria-label={translatePurpose(PURPOSE_KEY[purpose])}
                    checked={value.purposes?.includes(purpose) ?? false}
                    onCheckedChange={() =>
                      onChange({
                        ...value,
                        purposes: toggle(
                          value.purposes,
                          purpose,
                        ) as KnowledgeSourcePurpose[],
                      })
                    }
                  />
                  {translatePurpose(PURPOSE_KEY[purpose])}
                </label>
              ))}
            </fieldset>
            {spaces.length > 0 ? (
              <fieldset className="flex flex-col gap-1">
                <legend className="text-2xs font-bold uppercase tracking-wide text-muted-foreground">
                  {translate('spaces')}
                </legend>
                {spaces.map((space) => (
                  <label
                    className="flex items-center gap-2 text-sm"
                    key={space.id}
                  >
                    <Checkbox
                      aria-label={
                        space.isInbox ? translate('inbox') : space.title
                      }
                      checked={value.spaceIds?.includes(space.id) ?? false}
                      onCheckedChange={() =>
                        onChange({
                          ...value,
                          spaceIds: toggle(value.spaceIds, space.id),
                        })
                      }
                    />
                    {space.isInbox ? translate('inbox') : space.title}
                  </label>
                ))}
              </fieldset>
            ) : null}
            <fieldset className="flex max-h-48 flex-col gap-1 overflow-y-auto">
              <legend className="text-2xs font-bold uppercase tracking-wide text-muted-foreground">
                {translate('sources')}
              </legend>
              {isLoading ? (
                <span className="text-xs text-muted-foreground">
                  {translate('loading')}
                </span>
              ) : readyRows.length === 0 ? (
                <span className="text-xs text-muted-foreground">
                  {translate('empty')}
                </span>
              ) : (
                readyRows.map((row) => (
                  <label
                    className="flex items-center gap-2 text-sm"
                    key={row.source.id}
                  >
                    <Checkbox
                      aria-label={row.source.title}
                      checked={
                        value.sourceIds?.includes(row.source.id) ?? false
                      }
                      onCheckedChange={() =>
                        onChange({
                          ...value,
                          sourceIds: toggle(value.sourceIds, row.source.id),
                        })
                      }
                    />
                    <span className="truncate">{row.source.title}</span>
                    <span className="ml-auto text-2xs uppercase text-muted-foreground">
                      {translatePurpose(PURPOSE_KEY[row.source.purpose])}
                    </span>
                  </label>
                ))
              )}
            </fieldset>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {selectedCount > 0
                  ? translate('budget', {
                      passages: SELECTED_PASSAGE_BUDGET,
                      tokens: tokenEstimate,
                    })
                  : translate('brandDefault')}
              </span>
              {selectedCount > 0 ? (
                <Button
                  label={translate('clear')}
                  onClick={() => onChange({})}
                  variant={ButtonVariant.GHOST}
                />
              ) : null}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
