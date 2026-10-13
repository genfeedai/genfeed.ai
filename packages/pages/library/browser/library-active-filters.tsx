'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { LibraryFilterProps } from '@props/pages/library-browser.props';
import { Button } from '@ui/primitives/button';
import { SHELL_ICON_CLASS } from '@ui-constants/shell-chrome.constant';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useLibraryFilters } from './use-library-filters';

/**
 * What is applied right now, one removable chip each. It sits under the
 * toolbar rather than in it, so a long tag list can wrap without ever pushing
 * the icon actions onto a second line.
 */
export default function LibraryActiveFilters(props: LibraryFilterProps) {
  const translate = useTranslations('pages.library.browser.toolbar');
  const { activeFilters } = useLibraryFilters(props);

  if (activeFilters.length === 0) {
    return null;
  }

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 border-b border-border px-4 py-2 sm:px-6"
      data-testid="library-active-filters"
    >
      {activeFilters.map((filter) => (
        <Button
          ariaLabel={translate('removeFilter', { label: filter.label })}
          className="h-6 gap-1 rounded-full pr-1.5 pl-2.5 text-xs"
          key={filter.id}
          onClick={filter.onRemove}
          size={ButtonSize.XS}
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
        >
          {filter.label}
          <X className={SHELL_ICON_CLASS} />
        </Button>
      ))}
      {activeFilters.length > 1 ? (
        <Button
          className="h-6 px-2 text-xs text-foreground/60"
          onClick={props.onClearAllFilters}
          size={ButtonSize.XS}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        >
          {translate('clearAllFilters')}
        </Button>
      ) : null}
    </div>
  );
}
