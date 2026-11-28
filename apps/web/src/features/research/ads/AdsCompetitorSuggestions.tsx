'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { AdWatchlistPlatform } from '@genfeedai/contracts/interfaces';
import { Button } from '@ui/primitives/button';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

export interface AdsCompetitorSuggestionsProps {
  isAdding: boolean;
  platform: AdWatchlistPlatform;
  /** Competitors the brand's strategy names that are not watched yet. */
  suggestions: string[];
  /**
   * Scans left in the ads library. Watching a competitor spends one, so "Watch
   * all" is offered only when every suggestion can be scanned. Null: no limit.
   */
  scansLeft?: number | null;
  onAdd: (input: {
    advertiserHandle: string;
    platform: AdWatchlistPlatform;
  }) => void;
}

/**
 * The competitors the brand already names, one click from being watched. Used
 * in the watchlist and on the Ads page's first visit, so the person spends
 * their scan on a competitor instead of an empty form.
 */
export default function AdsCompetitorSuggestions({
  isAdding,
  onAdd,
  platform,
  scansLeft = null,
  suggestions,
}: AdsCompetitorSuggestionsProps) {
  const translate = useTranslations('pages.adsResearch.watchlist');

  if (suggestions.length === 0) {
    return null;
  }

  const canWatchAll = scansLeft === null || scansLeft >= suggestions.length;

  return (
    <div className="space-y-2" data-testid="watchlist-suggestions">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-foreground">
          {translate('suggestions.title')}
        </div>
        {canWatchAll ? (
          <Button
            variant={ButtonVariant.GHOST}
            size={ButtonSize.SM}
            disabled={isAdding}
            onClick={() => {
              for (const name of suggestions) {
                onAdd({ advertiserHandle: name, platform });
              }
            }}
          >
            {translate('suggestions.watchAll')}
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-foreground/60">
        {translate('suggestions.description')}
      </p>
      <ul className="flex flex-wrap gap-2">
        {suggestions.map((name) => (
          <li key={name}>
            <Button
              ariaLabel={translate('suggestions.watch', { name })}
              variant={ButtonVariant.SECONDARY}
              size={ButtonSize.SM}
              disabled={isAdding}
              icon={<Plus className="size-3.5" />}
              onClick={() => onAdd({ advertiserHandle: name, platform })}
            >
              {name}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
