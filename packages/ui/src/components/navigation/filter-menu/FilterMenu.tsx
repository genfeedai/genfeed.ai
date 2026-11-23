'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type {
  FilterMenuFacet,
  FilterMenuProps,
  SharedFilterMenuProps,
} from '@genfeedai/props/ui/forms/filter-menu.props';
import { Badge } from '@ui/primitives/badge';
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
import { ListFilter } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type KeyboardEvent, useRef, useState } from 'react';

/** A search box earns its place once a list is longer than a glance. */
const SEARCH_THRESHOLD = 8;

function getActiveCount(facet: FilterMenuFacet): number {
  if (facet.selection === 'multiple') {
    return facet.values.length;
  }
  if (facet.isCounted === false) {
    return 0;
  }
  if (facet.value === '') {
    // An empty value is "no filter" unless the facet lists it as a real choice
    // next to a different default.
    const isChoice =
      facet.options.some((option) => option.value === '') &&
      facet.defaultValue !== undefined;
    return isChoice && facet.defaultValue !== '' ? 1 : 0;
  }
  return facet.value !== facet.defaultValue ? 1 : 0;
}

const MENU_ITEM_SELECTOR =
  '[role="menuitem"],[role="menuitemradio"],[role="menuitemcheckbox"]';

function getMenuItems(root: HTMLElement | null): HTMLElement[] {
  return root
    ? Array.from(root.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR)).filter(
        (item) => item.getAttribute('aria-disabled') !== 'true',
      )
    : [];
}

function FilterMenuFacetItem({
  allLabel,
  facet,
}: {
  allLabel: string;
  facet: FilterMenuFacet;
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const term = searchTerm.trim().toLowerCase();
  const hasSearch =
    Boolean(facet.searchPlaceholder) && facet.options.length > SEARCH_THRESHOLD;
  const selectedValues =
    facet.selection === 'multiple' ? facet.values : [facet.value];
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
    // The option the value points at names itself, so a default that is a real
    // choice ("Last 30 days") reads as that choice, not as "All".
    summary =
      facet.options.find((option) => option.value === facet.value)?.label ??
      allLabel;
  } else if (facet.values.length > 0) {
    summary = String(facet.values.length);
  }

  // The search box is not a menu item, so the arrow keys never reach it. Down
  // leaves it for the first option; Up on the first option comes back to it.
  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Menu typeahead would otherwise swallow every keystroke.
    event.stopPropagation();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      getMenuItems(listRef.current)[0]?.focus();
    }
  };
  const handleListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowUp' || !hasSearch) {
      return;
    }
    if (getMenuItems(listRef.current)[0] === event.target) {
      event.preventDefault();
      event.stopPropagation();
      searchRef.current?.focus();
    }
  };

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
              ref={searchRef}
              onKeyDown={handleSearchKeyDown}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={facet.searchPlaceholder}
              value={searchTerm}
            />
          </div>
        ) : null}
        <div
          className="max-h-80 overflow-y-auto py-1"
          onKeyDown={handleListKeyDown}
          ref={listRef}
        >
          {facet.options.length === 0 ? (
            <DropdownMenuItem disabled>{facet.emptyLabel}</DropdownMenuItem>
          ) : facet.selection === 'single' ? (
            <DropdownMenuRadioGroup
              onValueChange={facet.onChange}
              value={facet.value}
            >
              {visibleOptions.map((option) => (
                <DropdownMenuRadioItem
                  className={option.isLiteral ? 'normal-case' : undefined}
                  count={option.count}
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
                  className={option.isLiteral ? 'normal-case' : undefined}
                  count={option.count}
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
 * Every filter axis behind one ghost "Filters" trigger with an active-count
 * badge, so it weighs the same as refresh and the view menu in the subbar. Each
 * facet is a submenu with a checkable (multiple) or radio (single) list, so a
 * toolbar stays one line however many facets a page has. Owners keep the state
 * and the URL/query mapping; this component only renders and reports changes.
 *
 * The view takes every text as given; `FilterMenu` below fills the missing
 * ones from the app's messages.
 */
function FilterMenuView({
  align = 'end',
  allLabel,
  className,
  clearLabel,
  facets,
  getActiveCountLabel,
  isAttached = false,
  label,
  onClear,
}: SharedFilterMenuProps) {
  const activeCount = facets.reduce(
    (count, facet) => count + getActiveCount(facet),
    0,
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className={cn(
            'h-8 shrink-0 gap-1.5 px-2.5 text-xs',
            isAttached && 'h-auto px-2 py-1',
            activeCount > 0 && 'text-foreground',
            className,
          )}
          icon={<ListFilter className={SHELL_ICON_CLASS} />}
          size={ButtonSize.SM}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        >
          {label}
          {activeCount > 0 ? (
            <>
              <Badge
                aria-hidden="true"
                shape="pill"
                value={activeCount}
                variant="inverse"
              />
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

/** The menu with the product app's messages filled in where a text is not given. */
function TranslatedFilterMenu({
  allLabel,
  clearLabel,
  getActiveCountLabel,
  label,
  ...props
}: FilterMenuProps) {
  const translate = useTranslations('ui.filtersButton');

  return (
    <FilterMenuView
      {...props}
      allLabel={allLabel ?? translate('all')}
      clearLabel={clearLabel ?? translate('clear')}
      getActiveCountLabel={
        getActiveCountLabel ??
        ((count: number) => translate('activeCount', { count }))
      }
      label={label ?? translate('menu')}
    />
  );
}

/**
 * The Filters menu of a page. Every filter axis of the page is a facet of this
 * one menu. The four texts default to the app's `ui.filtersButton` messages; a
 * caller without an intl provider (the marketing site) passes all four, and the
 * messages are never read.
 */
export default function FilterMenu(props: FilterMenuProps) {
  const { allLabel, clearLabel, getActiveCountLabel, label } = props;

  if (
    allLabel !== undefined &&
    clearLabel !== undefined &&
    getActiveCountLabel !== undefined &&
    label !== undefined
  ) {
    return (
      <FilterMenuView
        {...props}
        allLabel={allLabel}
        clearLabel={clearLabel}
        getActiveCountLabel={getActiveCountLabel}
        label={label}
      />
    );
  }

  return <TranslatedFilterMenu {...props} />;
}
