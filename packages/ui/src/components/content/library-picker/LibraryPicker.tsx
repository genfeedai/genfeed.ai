'use client';

import { CardEmptySize } from '@genfeedai/contracts';
import type { LibraryPickerProps } from '@genfeedai/props/ui/content/library-picker.props';
import LibraryGrid from '@ui/content/library-picker/LibraryGrid';
import SearchField from '@ui/content/search-field/SearchField';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import { EmptyState } from '@ui/primitives/empty-state';
import Spinner from '@ui/primitives/spinner';
import type { ReactElement } from 'react';

/**
 * The one dialog for choosing Library assets: a search field with the Filters
 * menu attached, then the Library grid. The grid is the dialog's only scroll
 * region, so the search stays put above it. The caller owns the data, the
 * search query and what a selection does; the picker holds no state.
 */
export default function LibraryPicker({
  description,
  emptyLabel,
  filters,
  footer,
  gridLabel,
  isLoading = false,
  isOpen,
  items,
  loadingLabel,
  query,
  searchLabel,
  searchPlaceholder,
  title,
  topSection,
  onOpenChange,
  onQueryChange,
  ...grid
}: LibraryPickerProps): ReactElement {
  return (
    <Dialog onOpenChange={onOpenChange} open={isOpen}>
      <DialogContent className="flex max-h-[min(80dvh,560px)] w-full max-w-lg flex-col gap-0 overflow-hidden border-border bg-popover p-0">
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col" scrollable={false}>
          {topSection ? (
            <div className="border-b border-border px-4 py-3">{topSection}</div>
          ) : null}

          <div className="border-b border-border px-4 py-3">
            <SearchField
              ariaLabel={searchLabel}
              className="w-full"
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={searchPlaceholder}
              value={query}
            >
              {filters}
            </SearchField>
          </div>

          <div
            aria-busy={isLoading}
            className="min-h-0 flex-1 overflow-y-auto p-3"
          >
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Spinner ariaLabel={loadingLabel} />
              </div>
            ) : items.length === 0 ? (
              <EmptyState size={CardEmptySize.SM} title={emptyLabel} />
            ) : (
              <LibraryGrid ariaLabel={gridLabel} items={items} {...grid} />
            )}
          </div>

          {footer ? (
            <div className="border-t border-border px-4 py-3">{footer}</div>
          ) : null}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
