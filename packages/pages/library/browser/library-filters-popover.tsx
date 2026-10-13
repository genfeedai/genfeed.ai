'use client';

import {
  ButtonSize,
  ButtonVariant,
  LibraryPlace,
  parseTagMatchMode,
  TagMatchMode,
} from '@genfeedai/contracts';
import {
  LIBRARY_MAX_CHARACTER_FILTERS,
  LIBRARY_MAX_TAG_FILTERS,
} from '@genfeedai/contracts/constants';
import { cn } from '@helpers/formatting/cn/cn.util';
import type {
  LibraryCharacterOption,
  LibraryFilterChoice,
  LibraryFiltersPopoverProps,
} from '@props/pages/library-browser.props';
import { EnvironmentService } from '@services/core/environment.service';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Popover,
  PopoverPanelContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { ToggleGroup, ToggleGroupItem } from '@ui/primitives/toggle-group';
import { SHELL_ICON_CLASS } from '@ui-constants/shell-chrome.constant';
import { SlidersHorizontal, UserRound } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';

import { useLibraryFilters } from './use-library-filters';

/** A search field earns its place once a list is longer than a glance. */
const SEARCH_THRESHOLD = 8;

const CHOICE_GROUP_CLASS = 'flex flex-wrap justify-start gap-1.5';
const CHOICE_CLASS =
  'h-7 min-w-0 gap-1.5 rounded-full border border-border px-2.5 text-xs font-medium data-[state=on]:border-foreground data-[state=on]:bg-foreground data-[state=on]:text-background';

function CharacterAvatar({ character }: { character: LibraryCharacterOption }) {
  if (!character.avatarIngredientId) {
    return (
      <span className="flex size-4 items-center justify-center rounded-full bg-background-tertiary text-muted-foreground">
        <UserRound className="size-2.5" />
      </span>
    );
  }

  return (
    <Image
      alt=""
      className="size-4 rounded-full object-cover outline-media"
      height={16}
      src={`${EnvironmentService.ingredientsEndpoint}/images/${character.avatarIngredientId}`}
      width={16}
    />
  );
}

function FilterSection({
  action,
  children,
  label,
}: {
  action?: ReactNode;
  children: ReactNode;
  label: string;
}) {
  return (
    <section aria-label={label} className="flex flex-col gap-2">
      <div className="flex min-h-5 items-center justify-between gap-2">
        <h3 className="text-xs font-medium text-foreground/60">{label}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function SingleChoiceGroup({
  ariaLabel,
  choices,
  onChange,
  value,
}: {
  ariaLabel: string;
  choices: LibraryFilterChoice[];
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <ToggleGroup
      aria-label={ariaLabel}
      className={CHOICE_GROUP_CLASS}
      onValueChange={(next) => {
        // Radix reports '' when the active item is pressed again; a single
        // choice never clears itself.
        if (next) {
          onChange(next);
        }
      }}
      size="sm"
      type="single"
      value={value}
    >
      {choices.map((choice) => (
        <ToggleGroupItem
          className={CHOICE_CLASS}
          key={choice.value}
          value={choice.value}
        >
          {choice.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function MultiChoiceGroup({
  ariaLabel,
  choices,
  isSearchEnabled = false,
  limit,
  limitMessage,
  onChange,
  renderIcon,
  searchPlaceholder,
  values,
}: {
  ariaLabel: string;
  choices: LibraryFilterChoice[];
  isSearchEnabled?: boolean;
  limit?: number;
  limitMessage?: string;
  onChange: (values: string[]) => void;
  renderIcon?: (value: string) => ReactNode;
  searchPlaceholder?: string;
  values: string[];
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const term = searchTerm.trim().toLowerCase();
  const hasSearch = isSearchEnabled && choices.length > SEARCH_THRESHOLD;
  // Selected choices stay visible while searching so a filter never vanishes.
  const visibleChoices =
    hasSearch && term
      ? choices.filter(
          (choice) =>
            values.includes(choice.value) ||
            choice.label.toLowerCase().includes(term),
        )
      : choices;

  return (
    <div className="flex flex-col gap-2">
      {hasSearch ? (
        <Input
          aria-label={searchPlaceholder}
          className="h-7 text-xs"
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder={searchPlaceholder}
          value={searchTerm}
        />
      ) : null}
      <ToggleGroup
        aria-label={ariaLabel}
        className={cn(
          CHOICE_GROUP_CLASS,
          hasSearch && 'max-h-28 overflow-y-auto',
        )}
        onValueChange={(next) => onChange(limit ? next.slice(0, limit) : next)}
        size="sm"
        type="multiple"
        value={values}
      >
        {visibleChoices.map((choice) => (
          <ToggleGroupItem
            className={CHOICE_CLASS}
            key={choice.value}
            value={choice.value}
          >
            {renderIcon?.(choice.value)}
            {choice.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {limit && limitMessage && values.length >= limit ? (
        <p className="text-xs text-foreground/50" role="status">
          {limitMessage}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Every filter axis and the sort order behind one trigger, so the toolbar is a
 * single line at any width. What is applied shows as chips beside the trigger
 * (see `LibraryActiveFilters`); the popover only ever has to say what is
 * possible.
 */
export default function LibraryFiltersPopover({
  onClearAllFilters,
  onCharactersChange,
  onSortChange,
  onTagMatchChange,
  onTagsChange,
  sort,
  sortOptions,
  ...filterProps
}: LibraryFiltersPopoverProps) {
  const translate = useTranslations('pages.library.browser.toolbar');
  const { characterOptions, characters, tagMatch, tagOptions, tags } =
    filterProps;
  const model = useLibraryFilters({
    ...filterProps,
    onCharactersChange,
    onTagsChange,
  });
  const activeCount = model.activeFilters.length;
  const isCharacterFilterVisible =
    characterOptions.length > 0 || characters.length > 0;
  const isTagFilterVisible = tagOptions.length > 0 || tags.length > 0;
  const characterChoices = characterOptions.map(({ id, label }) => ({
    label,
    value: id,
  }));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          className="h-8 shrink-0 gap-1.5 px-2.5 text-xs"
          icon={<SlidersHorizontal className={SHELL_ICON_CLASS} />}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
        >
          {translate('filters')}
          {activeCount > 0 ? (
            <>
              <span
                aria-hidden="true"
                className="rounded-full bg-foreground px-1.5 text-2xs font-semibold text-background"
              >
                {activeCount}
              </span>
              <span className="sr-only">
                {translate('activeFilterCount', { count: activeCount })}
              </span>
            </>
          ) : null}
        </Button>
      </PopoverTrigger>

      <PopoverPanelContent align="end" className="w-96 max-w-[90vw] p-0">
        <div className="flex max-h-[min(36rem,var(--radix-popover-content-available-height))] flex-col gap-4 overflow-y-auto p-4">
          <FilterSection label={translate('statusAria')}>
            <SingleChoiceGroup
              ariaLabel={translate('statusAria')}
              choices={model.statusChoices}
              onChange={model.onStatusValueChange}
              value={model.statusValue}
            />
          </FilterSection>

          <FilterSection label={translate('showAria')}>
            <SingleChoiceGroup
              ariaLabel={translate('showAria')}
              choices={[
                { label: translate('showAll'), value: 'all' },
                { label: translate('showRecent'), value: LibraryPlace.RECENT },
                {
                  label: translate('showStarred'),
                  value: LibraryPlace.STARRED,
                },
              ]}
              onChange={model.onPlaceValueChange}
              value={model.placeValue}
            />
          </FilterSection>

          <FilterSection label={translate('type')}>
            <MultiChoiceGroup
              ariaLabel={translate('type')}
              choices={model.typeChoices}
              onChange={model.onTypeValuesChange}
              values={model.typeValues}
            />
          </FilterSection>

          <FilterSection label={translate('origin')}>
            <MultiChoiceGroup
              ariaLabel={translate('origin')}
              choices={model.originChoices}
              onChange={model.onOriginValuesChange}
              values={filterProps.origins}
            />
          </FilterSection>

          {isCharacterFilterVisible ? (
            <FilterSection label={translate('character')}>
              <MultiChoiceGroup
                ariaLabel={translate('character')}
                choices={characterChoices}
                isSearchEnabled
                limit={LIBRARY_MAX_CHARACTER_FILTERS}
                limitMessage={translate('characterLimit', {
                  count: LIBRARY_MAX_CHARACTER_FILTERS,
                })}
                onChange={onCharactersChange}
                renderIcon={(value) => {
                  const character = characterOptions.find(
                    ({ id }) => id === value,
                  );
                  return character ? (
                    <CharacterAvatar character={character} />
                  ) : null;
                }}
                searchPlaceholder={translate('searchCharacters')}
                values={characters}
              />
            </FilterSection>
          ) : null}

          {isTagFilterVisible ? (
            <FilterSection
              action={
                tags.length > 1 ? (
                  <ToggleGroup
                    aria-label={translate('tagMatchAria')}
                    className="gap-0.5"
                    onValueChange={(value) => {
                      const mode = parseTagMatchMode(value);
                      if (mode) {
                        onTagMatchChange(mode);
                      }
                    }}
                    size="sm"
                    type="single"
                    value={tagMatch}
                  >
                    <ToggleGroupItem
                      className="h-5 rounded-full px-2 text-xs"
                      value={TagMatchMode.ANY}
                    >
                      {translate('matchAny')}
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      className="h-5 rounded-full px-2 text-xs"
                      value={TagMatchMode.ALL}
                    >
                      {translate('matchAll')}
                    </ToggleGroupItem>
                  </ToggleGroup>
                ) : null
              }
              label={translate('tags')}
            >
              <MultiChoiceGroup
                ariaLabel={translate('tags')}
                choices={model.tagChoices}
                isSearchEnabled
                limit={LIBRARY_MAX_TAG_FILTERS}
                limitMessage={translate('tagLimit', {
                  count: LIBRARY_MAX_TAG_FILTERS,
                })}
                onChange={onTagsChange}
                searchPlaceholder={translate('searchTags')}
                values={tags}
              />
            </FilterSection>
          ) : null}

          <FilterSection label={translate('sortAria')}>
            <SingleChoiceGroup
              ariaLabel={translate('sortAria')}
              choices={sortOptions}
              onChange={onSortChange}
              value={sort}
            />
          </FilterSection>
        </div>

        {activeCount > 0 ? (
          <div className="flex items-center justify-end border-t border-border px-4 py-2">
            <Button
              className="h-7 px-2 text-xs"
              onClick={onClearAllFilters}
              size={ButtonSize.SM}
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            >
              {translate('clearAllFilters')}
            </Button>
          </div>
        ) : null}
      </PopoverPanelContent>
    </Popover>
  );
}
