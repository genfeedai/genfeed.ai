'use client';

import {
  KnowledgeProcessingState,
  KnowledgeSourcePurpose,
} from '@genfeedai/contracts';
import type { KnowledgeSelection } from '@genfeedai/contracts/interfaces';
import { useKnowledgeLibrary } from '@pages/library/knowledge/hooks/use-knowledge-library';
import type { KnowledgeReferenceSectionProps } from '@props/content/knowledge-library.props';
import { Checkbox } from '@ui/primitives/checkbox';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

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

/** Rough upper bound on prompt tokens an explicit selection can add. */
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

/**
 * The Knowledge part of a Library reference picker. "Auto" (the default)
 * leaves grounding to automatic brand-scoped retrieval; unchecking it lets
 * the user pick exact sources or spaces, which then bind the generation.
 * Hosts key it by brand so a switch always starts back on Auto.
 */
export default function KnowledgeReferenceSection({
  brandId,
  onChange,
  value,
}: KnowledgeReferenceSectionProps) {
  const translate = useTranslations('pages.library.knowledge.reference');
  const translatePurpose = useTranslations('pages.library.knowledge.purpose');
  const [isExplicit, setIsExplicit] = useState(
    () => countKnowledgeSelection(value) > 0,
  );
  const { isLoading, rows, spaces } = useKnowledgeLibrary({
    brandId: isExplicit ? brandId : undefined,
  });
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

  if (!brandId) {
    return null;
  }

  return (
    <section
      aria-label={translate('title')}
      className="flex flex-col gap-2"
      data-testid="knowledge-reference-section"
    >
      <p className="text-2xs font-bold uppercase tracking-wide text-muted-foreground">
        {translate('title')}
      </p>
      <label className="flex items-start gap-2 text-sm">
        <Checkbox
          aria-label={translate('auto')}
          checked={!isExplicit}
          onCheckedChange={(checked) => {
            if (checked === true) {
              setIsExplicit(false);
              onChange({});
              return;
            }
            setIsExplicit(true);
          }}
        />
        <span className="flex flex-col">
          <span>{translate('auto')}</span>
          <span className="text-xs text-muted-foreground">
            {isExplicit ? translate('explicitHint') : translate('autoHint')}
          </span>
        </span>
      </label>
      {isExplicit ? (
        <div className="flex flex-col gap-2 pl-6">
          {spaces.length > 0 ? (
            <fieldset className="flex flex-col gap-1">
              <legend className="text-2xs font-bold uppercase tracking-wide text-muted-foreground">
                {translate('spaces')}
              </legend>
              {spaces.map((space) => {
                const label = space.isInbox ? translate('inbox') : space.title;
                return (
                  <label
                    className="flex items-center gap-2 text-sm"
                    key={space.id}
                  >
                    <Checkbox
                      aria-label={label}
                      checked={value.spaceIds?.includes(space.id) ?? false}
                      onCheckedChange={() =>
                        onChange({
                          ...value,
                          spaceIds: toggle(value.spaceIds, space.id),
                        })
                      }
                    />
                    {label}
                  </label>
                );
              })}
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
                    checked={value.sourceIds?.includes(row.source.id) ?? false}
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
          <p aria-live="polite" className="text-xs text-muted-foreground">
            {selectedCount > 0
              ? translate('budget', {
                  passages: SELECTED_PASSAGE_BUDGET,
                  tokens: estimateKnowledgeTokens(value),
                })
              : translate('nothingPicked')}
          </p>
        </div>
      ) : null}
    </section>
  );
}
