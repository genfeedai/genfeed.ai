'use client';

import type { GenerationSetupSubmenuListProps } from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import { getGenerationSetupLookPreviewTile } from '@ui/constants/generation-setup-look-preview.constant';
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@ui/primitives/dropdown-menu';
import { Input } from '@ui/primitives/input';
import { Check, ImageIcon } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { type KeyboardEvent, useState } from 'react';

const TYPING_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'Backspace',
  'Delete',
  'End',
  'Home',
]);

/**
 * Typing in the search box must not reach the menu: its typeahead would pull
 * focus to the first matching row. Arrow up/down and Escape still navigate.
 */
function keepTypingInSearch(event: KeyboardEvent<HTMLInputElement>): void {
  if (event.key.length === 1 || TYPING_KEYS.has(event.key))
    event.stopPropagation();
}

/**
 * One nested submenu: its options, an optional search box, and, for Look
 * fields with illustrations, a preview that follows the highlighted row.
 * Selecting a row closes the whole menu through Radix, unless the list is
 * nested (`isMenuKeptOpen`): then the menu stays open so the next field can be
 * changed, and the parent row already shows the new value.
 */
export default function GenerationSetupSubmenuList({
  isMenuKeptOpen = false,
  isSearchable = false,
  label,
  note,
  onReset,
  onValueChange,
  options,
  previewKind,
  value,
}: GenerationSetupSubmenuListProps) {
  const translate = useTranslations('agent.generationSetup');
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(value);
  const [failedUrl, setFailedUrl] = useState<string>();
  const needle = query.trim().toLowerCase();
  const visibleOptions = needle
    ? options.filter((option) => option.label.toLowerCase().includes(needle))
    : options;
  const preview =
    options.find((option) => option.value === highlighted) ??
    options.find((option) => option.value === value);
  const tile = preview
    ? getGenerationSetupLookPreviewTile(
        previewKind,
        preview.value,
        preview.isPlatformDefault,
      )
    : undefined;
  const previewUrl = preview?.thumbnailUrl ?? tile?.atlasUrl;
  const hasPreviewImage = Boolean(previewUrl) && previewUrl !== failedUrl;

  return (
    <div className="flex min-h-0">
      <div className="flex w-52 min-w-0 flex-col">
        {isSearchable ? (
          <Input
            aria-label={translate('searchField', {
              field: label.toLowerCase(),
            })}
            className="h-9 rounded-none border-0 border-b border-border bg-transparent px-3 text-xs focus-visible:ring-0"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={keepTypingInSearch}
            placeholder={translate('searchFieldPlaceholder', {
              field: label.toLowerCase(),
            })}
            value={query}
          />
        ) : null}
        <div
          aria-label={label}
          className="max-h-64 overflow-y-auto py-1"
          role="group"
        >
          {visibleOptions.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              {translate('noMatches')}
            </p>
          ) : null}
          {visibleOptions.map((option) => (
            <DropdownMenuItem
              key={option.value}
              className="min-h-8 gap-2 text-xs"
              onFocus={() => setHighlighted(option.value)}
              onPointerEnter={() => setHighlighted(option.value)}
              onSelect={(event) => {
                if (isMenuKeptOpen) event.preventDefault();
                onValueChange(option.value);
              }}
            >
              {option.icon}
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {option.isPlatformDefault ? (
                <span className="text-2xs text-muted-foreground">
                  {translate('platformDefault')}
                </span>
              ) : null}
              {option.value === value ? (
                <Check aria-hidden="true" className="size-3.5 shrink-0" />
              ) : null}
            </DropdownMenuItem>
          ))}
        </div>
        {note ? (
          <>
            <DropdownMenuSeparator className="my-0" />
            <p className="px-3 py-2 text-xs text-muted-foreground" role="note">
              {note}
            </p>
          </>
        ) : null}
        {onReset ? (
          <>
            <DropdownMenuSeparator className="my-0" />
            <DropdownMenuItem
              className="min-h-8 text-xs text-muted-foreground"
              onSelect={(event) => {
                if (isMenuKeptOpen) event.preventDefault();
                onReset();
              }}
            >
              {translate('resetToAgent', { field: label })}
            </DropdownMenuItem>
          </>
        ) : null}
      </div>
      {previewKind ? (
        <div
          aria-label={translate('lookPreviewAria', { field: label })}
          className="w-52 min-w-0 shrink-0 space-y-2 border-l border-border p-3"
          role="region"
        >
          {preview ? (
            <>
              {hasPreviewImage && previewUrl ? (
                <div className="relative aspect-square overflow-hidden rounded-md">
                  <Image
                    alt={translate('lookPreviewImageAlt', {
                      label: preview.label,
                    })}
                    className={
                      tile ? 'absolute max-w-none' : 'size-full object-cover'
                    }
                    height={tile ? tile.rows * 216 : 216}
                    onError={() => setFailedUrl(previewUrl)}
                    src={previewUrl}
                    style={
                      tile
                        ? {
                            height: `${tile.rows * 100}%`,
                            left: `${-tile.column * 100}%`,
                            top: `${-tile.row * 100}%`,
                            width: `${tile.columns * 100}%`,
                          }
                        : undefined
                    }
                    unoptimized
                    width={tile ? tile.columns * 216 : 216}
                  />
                </div>
              ) : (
                <div className="flex aspect-square items-center justify-center rounded-md bg-secondary text-muted-foreground">
                  <ImageIcon aria-hidden="true" className="size-8" />
                </div>
              )}
              <p className="text-xs font-medium">{preview.label}</p>
              {preview.description ? (
                <p className="text-xs text-muted-foreground">
                  {preview.description}
                </p>
              ) : null}
              {!hasPreviewImage ? (
                <p className="text-2xs text-muted-foreground">
                  {translate('lookPreviewUnavailable')}
                </p>
              ) : tile ? (
                <p className="text-2xs text-muted-foreground">
                  {translate('lookPreviewExample')}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              {translate('lookPreviewHint')}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
