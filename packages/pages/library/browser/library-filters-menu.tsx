'use client';

import {
  LibraryPlace,
  parseTagMatchMode,
  TagMatchMode,
} from '@genfeedai/contracts';
import {
  LIBRARY_MAX_CHARACTER_FILTERS,
  LIBRARY_MAX_TAG_FILTERS,
} from '@genfeedai/contracts/constants';
import type { FilterMenuFacet } from '@genfeedai/props/ui/forms/filter-menu.props';
import type {
  LibraryCharacterOption,
  LibraryFiltersMenuProps,
} from '@props/pages/library-browser.props';
import { EnvironmentService } from '@services/core/environment.service';
import FilterMenu from '@ui/content/filter-menu/FilterMenu';
import { UserRound } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';

import { useLibraryFilters } from './use-library-filters';

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

/**
 * Every filter axis and the sort order behind one trigger, so the toolbar is a
 * single line at any width. What is applied shows as chips beside the trigger
 * (see `LibraryActiveFilters`); the menu only ever has to say what is
 * possible.
 */
export default function LibraryFiltersMenu({
  onClearAllFilters,
  onCharactersChange,
  onSortChange,
  onTagMatchChange,
  onTagsChange,
  sort,
  sortOptions,
  ...filterProps
}: LibraryFiltersMenuProps) {
  const translate = useTranslations('pages.library.browser.toolbar');
  const { characterOptions, characters, tagMatch, tagOptions, tags } =
    filterProps;
  const model = useLibraryFilters({
    ...filterProps,
    onCharactersChange,
    onTagsChange,
  });
  const isCharacterFilterVisible =
    characterOptions.length > 0 || characters.length > 0;
  const isTagFilterVisible = tagOptions.length > 0 || tags.length > 0;

  const facets: FilterMenuFacet[] = [
    {
      defaultValue: 'all',
      key: 'status',
      label: translate('statusAria'),
      onChange: model.onStatusValueChange,
      options: model.statusChoices,
      selection: 'single',
      value: model.statusValue,
    },
    {
      defaultValue: 'all',
      key: 'show',
      label: translate('showAria'),
      onChange: model.onPlaceValueChange,
      options: [
        { label: translate('showAll'), value: 'all' },
        { label: translate('showRecent'), value: LibraryPlace.RECENT },
        { label: translate('showStarred'), value: LibraryPlace.STARRED },
      ],
      selection: 'single',
      value: model.placeValue,
    },
    {
      key: 'type',
      label: translate('type'),
      onChange: model.onTypeValuesChange,
      options: model.typeChoices,
      selection: 'multiple',
      values: model.typeValues,
    },
    {
      key: 'origin',
      label: translate('origin'),
      onChange: model.onOriginValuesChange,
      options: model.originChoices,
      selection: 'multiple',
      values: filterProps.origins,
    },
  ];

  if (isCharacterFilterVisible) {
    facets.push({
      key: 'character',
      label: translate('character'),
      maxSelected: LIBRARY_MAX_CHARACTER_FILTERS,
      maxSelectedMessage: translate('characterLimit', {
        count: LIBRARY_MAX_CHARACTER_FILTERS,
      }),
      onChange: onCharactersChange,
      options: characterOptions.map((character) => ({
        icon: <CharacterAvatar character={character} />,
        label: character.label,
        value: character.id,
      })),
      searchPlaceholder: translate('searchCharacters'),
      selection: 'multiple',
      values: characters,
    });
  }

  if (isTagFilterVisible) {
    facets.push({
      key: 'tags',
      label: translate('tags'),
      maxSelected: LIBRARY_MAX_TAG_FILTERS,
      maxSelectedMessage: translate('tagLimit', {
        count: LIBRARY_MAX_TAG_FILTERS,
      }),
      onChange: onTagsChange,
      options: model.tagChoices,
      searchPlaceholder: translate('searchTags'),
      selection: 'multiple',
      values: tags,
    });
  }

  if (tags.length > 1) {
    facets.push({
      isCounted: false,
      key: 'tag-match',
      label: translate('tagMatch'),
      onChange: (value) => {
        const mode = parseTagMatchMode(value);
        if (mode) {
          onTagMatchChange(mode);
        }
      },
      options: [
        { label: translate('matchAny'), value: TagMatchMode.ANY },
        { label: translate('matchAll'), value: TagMatchMode.ALL },
      ],
      selection: 'single',
      value: tagMatch,
    });
  }

  facets.push({
    isCounted: false,
    key: 'sort',
    label: translate('sortAria'),
    onChange: onSortChange,
    options: sortOptions,
    selection: 'single',
    value: sort,
  });

  return (
    <FilterMenu
      clearLabel={translate('clearAllFilters')}
      facets={facets}
      getActiveCountLabel={(count) => translate('activeFilterCount', { count })}
      label={translate('filters')}
      onClear={onClearAllFilters}
    />
  );
}
