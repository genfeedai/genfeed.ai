'use client';

import {
  INGREDIENT_ORIGIN_LABELS,
  INGREDIENT_ORIGIN_ORDER,
  LIBRARY_SHELF_LABELS,
  LIBRARY_SHELF_ORDER,
  LibraryPlace,
  LibraryShelf,
  parseIngredientOrigin,
  parseLibraryShelf,
} from '@genfeedai/contracts';
import type {
  LibraryActiveFilter,
  LibraryBrowserStatus,
  LibraryFilterChoice,
  LibraryFilterModel,
  LibraryFilterProps,
} from '@props/pages/library-browser.props';
import {
  categoriesFromAssetTypeIds,
  selectedAssetTypeIds,
} from '@utils/media/library-asset-type.util';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { LIBRARY_TYPE_CHIPS } from './library-browser.config';

const TYPE_CHOICES: LibraryFilterChoice[] = LIBRARY_TYPE_CHIPS.map((chip) => ({
  label: chip.label,
  value: chip.id,
}));

const ORIGIN_CHOICES: LibraryFilterChoice[] = INGREDIENT_ORIGIN_ORDER.map(
  (origin) => ({
    label: INGREDIENT_ORIGIN_LABELS[origin],
    value: origin,
  }),
);

function withCount(label: string, count: number | undefined): string {
  return typeof count === 'number' ? `${label} (${count})` : label;
}

/**
 * One reading of the filter axes for both surfaces that show them: the
 * Filters popover (every choice) and the chip row (only what is applied).
 */
export function useLibraryFilters({
  categories,
  characterOptions,
  characters,
  onCategoriesChange,
  onCharactersChange,
  onOriginsChange,
  onPlaceChange,
  onStatusChange,
  onTagsChange,
  origins,
  place,
  shelf,
  shelfCounts,
  tagOptions,
  tags,
  trashedCount,
}: Pick<
  LibraryFilterProps,
  | 'categories'
  | 'characterOptions'
  | 'characters'
  | 'onCategoriesChange'
  | 'onCharactersChange'
  | 'onOriginsChange'
  | 'onPlaceChange'
  | 'onStatusChange'
  | 'onTagsChange'
  | 'origins'
  | 'place'
  | 'shelf'
  | 'shelfCounts'
  | 'tagOptions'
  | 'tags'
  | 'trashedCount'
>): LibraryFilterModel {
  const translate = useTranslations('pages.library.browser.toolbar');
  const statusValue = place === LibraryPlace.TRASH ? 'trash' : (shelf ?? 'all');
  // Recent and Starred compose with a shelf; Trash replaces them.
  const placeValue =
    place === LibraryPlace.RECENT || place === LibraryPlace.STARRED
      ? place
      : 'all';
  const typeValues = selectedAssetTypeIds(categories);

  const statusChoices = useMemo(() => {
    const choices: LibraryFilterChoice[] = [
      { label: translate('statusAll'), value: 'all' },
    ];

    for (const shelfKey of LIBRARY_SHELF_ORDER) {
      const count = shelfCounts?.[shelfKey];
      if (
        shelfKey === LibraryShelf.GENERATING &&
        (count ?? 0) === 0 &&
        statusValue !== LibraryShelf.GENERATING
      ) {
        continue;
      }

      choices.push({
        label: withCount(LIBRARY_SHELF_LABELS[shelfKey], count),
        value: shelfKey,
      });
    }

    choices.push({
      label: withCount(translate('statusTrash'), trashedCount),
      value: 'trash',
    });

    return choices;
  }, [shelfCounts, statusValue, translate, trashedCount]);

  // The count is the number of this brand's assets carrying the tag, so a
  // filter never promises more than the list can show.
  const tagChoices = useMemo(
    () =>
      tagOptions.map((tag) => ({
        label: withCount(tag.label, tag.assetCount),
        value: tag.id,
      })),
    [tagOptions],
  );

  const handleStatusValueChange = (value: string) => {
    if (value === 'all') {
      onStatusChange(null);
      return;
    }

    if (value === 'trash') {
      onStatusChange('trash' satisfies LibraryBrowserStatus);
      return;
    }

    const nextShelf = parseLibraryShelf(value);
    if (nextShelf) {
      onStatusChange(nextShelf);
    }
  };

  const handlePlaceValueChange = (value: string) => {
    if (value === LibraryPlace.RECENT || value === LibraryPlace.STARRED) {
      onPlaceChange(value);
      return;
    }
    onPlaceChange(null);
  };

  const handleTypeValuesChange = (values: string[]) => {
    onCategoriesChange(categoriesFromAssetTypeIds(values));
  };

  const handleOriginValuesChange = (values: string[]) => {
    onOriginsChange(
      values.flatMap((value) => {
        const origin = parseIngredientOrigin(value);
        return origin ? [origin] : [];
      }),
    );
  };

  const activeFilters: LibraryActiveFilter[] = [];

  if (statusValue === 'trash') {
    activeFilters.push({
      id: 'status',
      label: translate('statusTrash'),
      onRemove: () => onStatusChange(null),
    });
  } else {
    const activeShelf = parseLibraryShelf(statusValue);
    if (activeShelf) {
      activeFilters.push({
        id: 'status',
        label: LIBRARY_SHELF_LABELS[activeShelf],
        onRemove: () => onStatusChange(null),
      });
    }
  }

  if (placeValue !== 'all') {
    activeFilters.push({
      id: 'place',
      label:
        placeValue === LibraryPlace.RECENT
          ? translate('showRecent')
          : translate('showStarred'),
      onRemove: () => onPlaceChange(null),
    });
  }

  for (const typeId of typeValues) {
    const choice = TYPE_CHOICES.find((option) => option.value === typeId);
    activeFilters.push({
      id: `type:${typeId}`,
      label: choice?.label ?? typeId,
      onRemove: () =>
        onCategoriesChange(
          categoriesFromAssetTypeIds(typeValues.filter((id) => id !== typeId)),
        ),
    });
  }

  for (const origin of origins) {
    activeFilters.push({
      id: `origin:${origin}`,
      label: INGREDIENT_ORIGIN_LABELS[origin],
      onRemove: () =>
        onOriginsChange(origins.filter((value) => value !== origin)),
    });
  }

  for (const characterId of characters) {
    const option = characterOptions.find(({ id }) => id === characterId);
    activeFilters.push({
      id: `character:${characterId}`,
      label: option?.label ?? translate('character'),
      onRemove: () =>
        onCharactersChange(characters.filter((id) => id !== characterId)),
    });
  }

  for (const tagId of tags) {
    const option = tagOptions.find(({ id }) => id === tagId);
    activeFilters.push({
      id: `tag:${tagId}`,
      label: option?.label ?? translate('tags'),
      onRemove: () => onTagsChange(tags.filter((id) => id !== tagId)),
    });
  }

  return {
    activeFilters,
    onOriginValuesChange: handleOriginValuesChange,
    onPlaceValueChange: handlePlaceValueChange,
    onStatusValueChange: handleStatusValueChange,
    onTypeValuesChange: handleTypeValuesChange,
    originChoices: ORIGIN_CHOICES,
    placeValue,
    statusChoices,
    statusValue,
    tagChoices,
    typeChoices: TYPE_CHOICES,
    typeValues,
  };
}
