'use client';

import { X } from 'lucide-react';
import type {
  ChangeEvent,
  MouseEvent as ReactMouseEvent,
  RefObject,
} from 'react';
import { Input } from './input';

type DropdownSearchBarProps = {
  isSearchEnabled: boolean;
  searchTerm: string;
  placeholder: string;
  searchInputRef: RefObject<HTMLInputElement | null>;
  onSearchChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
};

export default function DropdownSearchBar({
  isSearchEnabled,
  searchTerm,
  placeholder,
  searchInputRef,
  onSearchChange,
  onClear,
}: DropdownSearchBarProps) {
  if (!isSearchEnabled) {
    return null;
  }

  return (
    <div className="sticky top-0 z-10 bg-popover pb-2">
      <div className="relative p-1">
        <Input
          value={searchTerm}
          onChange={onSearchChange}
          placeholder={placeholder}
          inputRef={searchInputRef}
          onClick={(event: ReactMouseEvent<HTMLInputElement>) =>
            event.stopPropagation()
          }
          className="pr-8"
        />
        {searchTerm && (
          <button
            type="button"
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/50 transition-colors hover:text-foreground"
            onClick={(event) => {
              event.stopPropagation();
              onClear();
            }}
          >
            <X className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}
