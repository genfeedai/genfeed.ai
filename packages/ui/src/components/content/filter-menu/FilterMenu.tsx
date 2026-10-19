'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type {
  FilterMenuFacet,
  FilterMenuProps,
} from '@genfeedai/props/ui/forms/filter-menu.props';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { Input } from '@ui/primitives/input';
import { SHELL_ICON_CLASS } from '@ui-constants/shell-chrome.constant';
import { SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';

/** A search box earns its place once a list is longer than a glance. */
const SEARCH_THRESHOLD = 8;

function getActiveCount(facet: FilterMenuFacet): number {
  if (facet.selection === 'multiple') {
    return facet.values.length;
  }
  if (facet.isCounted === false) {
    return 0;
  }
  return facet.value && facet.value !== facet.defaultValue ? 1 : 0;
}

function FilterMenuFacetItem({
  allLabel,
  facet,
}: {
  allLabel: string;
  facet: FilterMenuFacet;
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const term = searchTerm.trim().toLowerCase();
  const hasSearch =
    Boolean(facet.searchPlaceholder) && facet.options.length > SEARCH_THRESHOLD;
  const selectedValues =
    facet.selection === 'multiple'
      ? facet.values
      : facet.value
        ? [facet.value]
        : [];
  // Selected options stay visible while searching so a filter never vanishes.
  const visibleOptions =
    hasSearch && term
      ? facet.options.filter(
          (option) =>
            selectedValues.includes(option.value) ||
            option.label.toLowerCase().includes(term),
        )
      : facet.options;

  let summary = allLabel;
  if (facet.selection === 'single') {
    if (facet.value && facet.value !== facet.defaultValue) {
      summary =
        facet.options.find((option) => option.value === facet.value)?.label ??
        allLabel;
    }
  } else if (facet.values.length > 0) {
    summary = String(facet.values.length);
  }

  const isLimitReached =
    facet.selection === 'multiple' &&
    facet.maxSelected !== undefined &&
    facet.values.length >= facet.maxSelected;

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="[&>svg]:ml-0">
        {facet.label}
        <span className="ml-auto max-w-24 truncate text-xs text-muted-foreground">
          {summary}
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-52 p-0">
        {hasSearch ? (
          <div className="p-1.5">
            <Input
              aria-label={facet.searchPlaceholder}
              className="h-control-sm text-xs"
              // Menu typeahead would otherwise swallow every keystroke.
              onKeyDown={(event) => event.stopPropagation()}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={facet.searchPlaceholder}
              value={searchTerm}
            />
          </div>
        ) : null}
        <div className="max-h-72 overflow-y-auto py-1">
          {facet.options.length === 0 ? (
            <DropdownMenuItem disabled>{facet.emptyLabel}</DropdownMenuItem>
          ) : facet.selection === 'single' ? (
            <DropdownMenuRadioGroup
              onValueChange={facet.onChange}
              value={facet.value}
            >
              {visibleOptions.map((option) => (
                <DropdownMenuRadioItem
                  className="gap-2"
                  key={option.value}
                  value={option.value}
                >
                  {option.icon}
                  {option.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          ) : (
            visibleOptions.map((option) => {
              const isChecked = facet.values.includes(option.value);
              return (
                <DropdownMenuCheckboxItem
                  checked={isChecked}
                  className="gap-2"
                  disabled={isLimitReached && !isChecked}
                  key={option.value}
                  onCheckedChange={(checked) =>
                    facet.onChange(
                      checked
                        ? [...facet.values, option.value]
                        : facet.values.filter(
                            (value) => value !== option.value,
                          ),
                    )
                  }
                  // Keep the menu open so several values can be picked in a row.
                  onSelect={(event) => event.preventDefault()}
                >
                  {option.icon}
                  {option.label}
                </DropdownMenuCheckboxItem>
              );
            })
          )}
        </div>
        {isLimitReached && facet.selection === 'multiple' ? (
          <DropdownMenuLabel className="border-t border-border normal-case tracking-normal">
            {facet.maxSelectedMessage}
          </DropdownMenuLabel>
        ) : null}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

/**
 * Every filter axis behind one "Filters" trigger: each facet is a submenu with
 * a checkable (multiple) or radio (single) list, so a toolbar stays one line
 * however many facets a page has. Owners keep the state and the URL/query
 * mapping; this component only renders and reports changes.
 */
export default function FilterMenu({
  align = 'end',
  allLabel = 'All',
  className,
  clearLabel,
  facets,
  getActiveCountLabel,
  label,
  onClear,
}: FilterMenuProps) {
  const activeCount = facets.reduce(
    (count, facet) => count + getActiveCount(facet),
    0,
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className={className ?? 'h-8 shrink-0 gap-1.5 px-2.5 text-xs'}
          icon={<SlidersHorizontal className={SHELL_ICON_CLASS} />}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
        >
          {label}
          {activeCount > 0 ? (
            <>
              <span
                aria-hidden="true"
                className="rounded-full bg-foreground px-1.5 text-2xs font-semibold text-background"
              >
                {activeCount}
              </span>
              <span className="sr-only">
                {getActiveCountLabel(activeCount)}
              </span>
            </>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-56">
        {facets.map((facet) => (
          <FilterMenuFacetItem
            allLabel={allLabel}
            facet={facet}
            key={facet.key}
          />
        ))}
        {activeCount > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onClear}>{clearLabel}</DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
