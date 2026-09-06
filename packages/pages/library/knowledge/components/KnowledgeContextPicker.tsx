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
import { useMemo } from 'react';

/** Passages the harness folds in for an explicit selection, ~500 chars each. */
const SELECTED_PASSAGE_BUDGET = 8;
const CHARS_PER_PASSAGE = 500;
const CHARS_PER_TOKEN = 4;

const PURPOSE_LABEL: Record<KnowledgeSourcePurpose, string> = {
  [KnowledgeSourcePurpose.BRAND_TRUTH]: 'Brand Truth',
  [KnowledgeSourcePurpose.INSPIRATION]: 'Inspiration',
  [KnowledgeSourcePurpose.RESEARCH]: 'Research',
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
                ? `Knowledge · ${selectedCount} selected`
                : 'Knowledge'
            }
            variant={ButtonVariant.SECONDARY}
          />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80">
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-sm font-semibold">Ground this generation</p>
              <p className="text-xs text-muted-foreground">
                Pick sources or spaces; only ready, visible sources apply.
              </p>
            </div>
            <fieldset className="flex flex-col gap-1">
              <legend className="text-2xs font-bold uppercase tracking-wide text-muted-foreground">
                Purposes
              </legend>
              {Object.values(KnowledgeSourcePurpose).map((purpose) => (
                <label
                  className="flex items-center gap-2 text-sm"
                  key={purpose}
                >
                  <Checkbox
                    aria-label={PURPOSE_LABEL[purpose]}
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
                  {PURPOSE_LABEL[purpose]}
                </label>
              ))}
            </fieldset>
            {spaces.length > 0 ? (
              <fieldset className="flex flex-col gap-1">
                <legend className="text-2xs font-bold uppercase tracking-wide text-muted-foreground">
                  Spaces
                </legend>
                {spaces.map((space) => (
                  <label
                    className="flex items-center gap-2 text-sm"
                    key={space.id}
                  >
                    <Checkbox
                      aria-label={space.isInbox ? 'Inbox' : space.title}
                      checked={value.spaceIds?.includes(space.id) ?? false}
                      onCheckedChange={() =>
                        onChange({
                          ...value,
                          spaceIds: toggle(value.spaceIds, space.id),
                        })
                      }
                    />
                    {space.isInbox ? 'Inbox' : space.title}
                  </label>
                ))}
              </fieldset>
            ) : null}
            <fieldset className="flex max-h-48 flex-col gap-1 overflow-y-auto">
              <legend className="text-2xs font-bold uppercase tracking-wide text-muted-foreground">
                Sources
              </legend>
              {isLoading ? (
                <span className="text-xs text-muted-foreground">Loading…</span>
              ) : readyRows.length === 0 ? (
                <span className="text-xs text-muted-foreground">
                  No ready sources yet. Add some in Library › Knowledge.
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
                      {PURPOSE_LABEL[row.source.purpose]}
                    </span>
                  </label>
                ))
              )}
            </fieldset>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {selectedCount > 0
                  ? `Up to ${SELECTED_PASSAGE_BUDGET} passages · ~${tokenEstimate} tokens`
                  : 'Brand default: top matches from all sources'}
              </span>
              {selectedCount > 0 ? (
                <Button
                  label="Clear"
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
