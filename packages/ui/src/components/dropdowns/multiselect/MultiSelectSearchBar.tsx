'use client';

import { ComponentSize } from '@genfeedai/enums';
import FormSearchbar from '@ui/primitives/searchbar';
import type { ChangeEvent, RefObject } from 'react';

type MultiSelectSearchBarProps = {
  searchTerm: string;
  searchPlaceholder: string;
  searchInputRef: RefObject<HTMLInputElement | null>;
  onSearchChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
};

export default function MultiSelectSearchBar({
  searchTerm,
  searchPlaceholder,
  searchInputRef,
  onSearchChange,
  onClear,
}: MultiSelectSearchBarProps) {
  return (
    <div className="sticky top-0 bg-popover z-10 px-2 py-1.5 border-b border-white/10">
      <FormSearchbar
        value={searchTerm}
        onChange={onSearchChange}
        placeholder={searchPlaceholder}
        inputRef={searchInputRef}
        onClick={(e) => e.stopPropagation()}
        onClear={onClear}
        size={ComponentSize.SM}
      />
    </div>
  );
}
