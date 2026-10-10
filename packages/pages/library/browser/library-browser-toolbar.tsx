'use client';

import {
  ButtonSize,
  ButtonVariant,
  ComponentSize,
  INGREDIENT_ORIGIN_LABELS,
  INGREDIENT_ORIGIN_ORDER,
  LIBRARY_SHELF_LABELS,
  LIBRARY_SHELF_ORDER,
  LibraryPlace,
  LibraryShelf,
  parseIngredientOrigin,
  parseLibraryShelf,
  parseTagMatchMode,
  TagMatchMode,
  ViewType,
} from '@genfeedai/contracts';
import {
  LIBRARY_CANVAS_FEATURE_FLAG,
  LIBRARY_MAX_CHARACTER_FILTERS,
  LIBRARY_MAX_TAG_FILTERS,
  type LibraryViewMode,
} from '@genfeedai/contracts/constants';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useFeatureFlag } from '@hooks/feature-flags/use-feature-flag/use-feature-flag';
import type {
  LibraryBrowserStatus,
  LibraryBrowserToolbarProps,
  LibraryCharacterOption,
} from '@props/pages/library-browser.props';
import { EnvironmentService } from '@services/core/environment.service';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import DropdownMultiSelect from '@ui/dropdowns/multiselect/DropdownMultiSelect';
import ViewToggle from '@ui/navigation/view-toggle/ViewToggle';
import { Button } from '@ui/primitives/button';
import {
  fieldControlClassName,
  fieldControlTriggerClassName,
} from '@ui/primitives/field-control';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import LibraryTagManagerDialog from '@ui/tags/library-tag-picker/LibraryTagManagerDialog';
import {
  SHELL_ICON_BUTTON_CLASS,
  SHELL_ICON_CLASS,
} from '@ui-constants/shell-chrome.constant';
import {
  categoriesFromAssetTypeIds,
  selectedAssetTypeIds,
} from '@utils/media/library-asset-type.util';
import {
  Frame,
  LayoutGrid,
  Rows3,
  Sparkles,
  Upload,
  UserRound,
  X,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { LIBRARY_TYPE_CHIPS } from './library-browser.config';

/** Filter triggers compact until the Library page is wide enough for full ones. */
const FILTER_WIDTH_CLASS = 'w-22 @[64rem]/library:w-32';

/** "Needs review (21)" has to stay readable when the row is compact. */
const STATUS_WIDTH_CLASS = 'w-40 @[64rem]/library:w-48';
const PLACE_WIDTH_CLASS = 'w-32 @[64rem]/library:w-36';

function statusOptionLabel(label: string, count: number | undefined): string {
  return typeof count === 'number' ? `${label} (${count})` : label;
}

const GRID_VIEW_OPTION = {
  icon: <LayoutGrid className={SHELL_ICON_CLASS} />,
  type: ViewType.GRID,
};

const LIST_VIEW_OPTION = {
  icon: <Rows3 className={SHELL_ICON_CLASS} />,
  type: ViewType.LIST,
};

const CANVAS_VIEW_OPTION = {
  icon: <Frame className={SHELL_ICON_CLASS} />,
  type: ViewType.CANVAS,
};

/**
 * The same filtered result set, arranged three ways. Canvas is the mood board:
 * it moved off its own route so the shelf, folder and type axes keep applying
 * to it instead of being abandoned at a nav link.
 */
const VIEW_TYPE_TO_MODE: Record<string, LibraryViewMode> = {
  [ViewType.CANVAS]: 'canvas',
  [ViewType.GRID]: 'grid',
  [ViewType.LIST]: 'list',
};

const MODE_TO_VIEW_TYPE: Record<LibraryViewMode, ViewType> = {
  canvas: ViewType.CANVAS,
  grid: ViewType.GRID,
  list: ViewType.LIST,
};

const TYPE_OPTIONS = LIBRARY_TYPE_CHIPS.map((chip) => ({
  label: chip.label,
  value: chip.id,
}));

const ORIGIN_OPTIONS = INGREDIENT_ORIGIN_ORDER.map((origin) => ({
  label: INGREDIENT_ORIGIN_LABELS[origin],
  value: origin,
}));

function CharacterAvatar({ character }: { character: LibraryCharacterOption }) {
  if (!character.avatarIngredientId) {
    return (
      <span className="flex size-5 items-center justify-center rounded-full bg-background-tertiary text-muted-foreground">
        <UserRound className="size-3" />
      </span>
    );
  }

  return (
    <Image
      alt=""
      className="size-5 rounded-full object-cover outline-media"
      height={20}
      src={`${EnvironmentService.ingredientsEndpoint}/images/${character.avatarIngredientId}`}
      width={20}
    />
  );
}

/**
 * The Library's control plane: status, type, and origin filters, plus search,
 * sort and density. Status is the shelf (generation state) and Trash. Folder
 * stays in the sidebar. Origin, character, and tags are filters and never get
 * a nav entry.
 */
export default function LibraryBrowserToolbar({
  isRecoveryView = false,
  categories,
  characterOptions,
  characters,
  onPlaceChange,
  onStatusChange,
  origins,
  place,
  shelf,
  shelfCounts,
  sort,
  sortOptions,
  tagMatch,
  tagOptions,
  tags,
  trashedCount,
  viewMode,
  onCategoriesChange,
  onCharactersChange,
  onClearCategories,
  onClearCharacters,
  onClearOrigins,
  onClearTags,
  onOriginsChange,
  onSortChange,
  onTagMatchChange,
  onTagsChange,
  onViewModeChange,
}: Omit<
  LibraryBrowserToolbarProps,
  'onRefresh' | 'onUpload' | 'isRefreshing'
>) {
  const translate = useTranslations('pages.library.browser.toolbar');
  const hasTypeFilter = categories.length > 0;
  const hasOriginFilter = origins.length > 0;
  const hasCharacterFilter = characters.length > 0;
  const isCharacterFilterVisible =
    characterOptions.length > 0 || hasCharacterFilter;
  const hasTagFilter = tags.length > 0;
  const isTagFilterVisible = tagOptions.length > 0 || hasTagFilter;
  const selectedTypeIds = selectedAssetTypeIds(categories);
  const isCanvasEnabled = useFeatureFlag(LIBRARY_CANVAS_FEATURE_FLAG);
  const statusValue = place === LibraryPlace.TRASH ? 'trash' : (shelf ?? 'all');
  const statusOptions = useMemo(() => {
    const options: { label: string; value: string }[] = [
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

      options.push({
        label: statusOptionLabel(LIBRARY_SHELF_LABELS[shelfKey], count),
        value: shelfKey,
      });
    }

    options.push({
      label: statusOptionLabel(translate('statusTrash'), trashedCount),
      value: 'trash',
    });

    return options;
  }, [shelfCounts, statusValue, translate, trashedCount]);

  // Recent and Starred compose with a shelf; Trash replaces them.
  const placeValue =
    place === LibraryPlace.RECENT || place === LibraryPlace.STARRED
      ? place
      : 'all';
  const handlePlaceValueChange = (value: string) => {
    if (value === LibraryPlace.RECENT || value === LibraryPlace.STARRED) {
      onPlaceChange(value);
      return;
    }
    onPlaceChange(null);
  };

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

  const characterDropdownOptions = useMemo(
    () =>
      characterOptions.map((character) => ({
        icon: <CharacterAvatar character={character} />,
        label: character.label,
        value: character.id,
      })),
    [characterOptions],
  );

  // The count is the number of this brand's assets carrying the tag, so a
  // filter never promises more than the list can show.
  const tagDropdownOptions = useMemo(
    () =>
      tagOptions.map((tag) => ({
        label:
          typeof tag.assetCount === 'number'
            ? `${tag.label} (${tag.assetCount})`
            : tag.label,
        value: tag.id,
      })),
    [tagOptions],
  );

  const viewOptions = useMemo(() => {
    const options = [
      { ...GRID_VIEW_OPTION, label: translate('contactSheet') },
      { ...LIST_VIEW_OPTION, label: translate('list') },
    ];
    if (isCanvasEnabled) {
      options.push({ ...CANVAS_VIEW_OPTION, label: translate('canvas') });
    }
    return options;
  }, [isCanvasEnabled, translate]);

  return (
    // Tiers key off the Library page width (`@container/library` on the layout
    // Container), so opening the inspector compacts the row instead of
    // wrapping it. Items only wrap as a last resort on narrow widths.
    <div className="flex max-w-full min-w-0 flex-wrap items-center gap-2 @[44rem]/library:flex-nowrap">
      <Select value={placeValue} onValueChange={handlePlaceValueChange}>
        <SelectTrigger
          aria-label={translate('showAria')}
          className={PLACE_WIDTH_CLASS}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{translate('showAll')}</SelectItem>
          <SelectItem value={LibraryPlace.RECENT}>
            {translate('showRecent')}
          </SelectItem>
          <SelectItem value={LibraryPlace.STARRED}>
            {translate('showStarred')}
          </SelectItem>
        </SelectContent>
      </Select>

      <Select value={statusValue} onValueChange={handleStatusValueChange}>
        <SelectTrigger
          aria-label={translate('statusAria')}
          className={STATUS_WIDTH_CLASS}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {statusOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex min-w-0 items-center gap-1.5">
        <DropdownMultiSelect
          className={cn(
            fieldControlClassName,
            fieldControlTriggerClassName,
            FILTER_WIDTH_CLASS,
          )}
          name="categories"
          onChange={(_name, values) => {
            onCategoriesChange(categoriesFromAssetTypeIds(values));
          }}
          options={TYPE_OPTIONS}
          placeholder={translate('type')}
          values={selectedTypeIds}
        />

        {hasTypeFilter ? (
          <Button
            className="h-7 rounded-full px-2 text-xs text-foreground/50 hover:text-foreground"
            icon={<X className="size-3.5" />}
            onClick={onClearCategories}
            tooltip={translate('clearTypeFilter')}
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
          />
        ) : null}
      </div>

      <div className="flex min-w-0 items-center gap-1.5">
        <DropdownMultiSelect
          className={cn(
            fieldControlClassName,
            fieldControlTriggerClassName,
            FILTER_WIDTH_CLASS,
          )}
          name="origins"
          onChange={(_name, values) => {
            onOriginsChange(
              values.flatMap((value) => {
                const origin = parseIngredientOrigin(value);
                return origin ? [origin] : [];
              }),
            );
          }}
          options={ORIGIN_OPTIONS}
          placeholder={translate('origin')}
          values={origins}
        />

        {hasOriginFilter ? (
          <Button
            ariaLabel={translate('clearOriginFilter')}
            className="h-7 rounded-full px-2 text-xs text-foreground/50 hover:text-foreground"
            icon={<X className="size-3.5" />}
            onClick={onClearOrigins}
            tooltip={translate('clearOriginFilter')}
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
          />
        ) : null}
      </div>

      {isCharacterFilterVisible ? (
        <div className="flex min-w-0 items-center gap-1.5">
          <DropdownMultiSelect
            className={cn(
              fieldControlClassName,
              fieldControlTriggerClassName,
              FILTER_WIDTH_CLASS,
            )}
            isSearchEnabled
            name="characters"
            onChange={(_name, values) => {
              onCharactersChange(
                values.slice(0, LIBRARY_MAX_CHARACTER_FILTERS),
              );
            }}
            options={characterDropdownOptions}
            placeholder={translate('character')}
            searchPlaceholder={translate('searchCharacters')}
            values={characters}
          />

          {characters.length >= LIBRARY_MAX_CHARACTER_FILTERS ? (
            <span className="text-xs text-foreground/50" role="status">
              {translate('characterLimit', {
                count: LIBRARY_MAX_CHARACTER_FILTERS,
              })}
            </span>
          ) : null}

          {hasCharacterFilter ? (
            <Button
              ariaLabel={translate('clearCharacterFilter')}
              className="h-7 rounded-full px-2 text-xs text-foreground/50 hover:text-foreground"
              icon={<X className="size-3.5" />}
              onClick={onClearCharacters}
              tooltip={translate('clearCharacterFilter')}
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
            />
          ) : null}
        </div>
      ) : null}

      {isTagFilterVisible ? (
        <div className="flex min-w-0 items-center gap-1.5">
          <DropdownMultiSelect
            className={cn(
              fieldControlClassName,
              fieldControlTriggerClassName,
              FILTER_WIDTH_CLASS,
            )}
            isSearchEnabled
            name="tags"
            onChange={(_name, values) => {
              onTagsChange(values.slice(0, LIBRARY_MAX_TAG_FILTERS));
            }}
            options={tagDropdownOptions}
            placeholder={translate('tags')}
            searchPlaceholder={translate('searchTags')}
            values={tags}
          />

          {tags.length >= LIBRARY_MAX_TAG_FILTERS ? (
            <span className="text-xs text-foreground/50" role="status">
              {translate('tagLimit', { count: LIBRARY_MAX_TAG_FILTERS })}
            </span>
          ) : null}

          {tags.length > 1 ? (
            <Select
              onValueChange={(value) => {
                const mode = parseTagMatchMode(value);
                if (mode) {
                  onTagMatchChange(mode);
                }
              }}
              value={tagMatch}
            >
              <SelectTrigger
                aria-label={translate('tagMatchAria')}
                className="w-32"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TagMatchMode.ANY}>
                  {translate('matchAny')}
                </SelectItem>
                <SelectItem value={TagMatchMode.ALL}>
                  {translate('matchAll')}
                </SelectItem>
              </SelectContent>
            </Select>
          ) : null}

          {hasTagFilter ? (
            <Button
              ariaLabel={translate('clearTagFilter')}
              className="h-7 rounded-full px-2 text-xs text-foreground/50 hover:text-foreground"
              icon={<X className="size-3.5" />}
              onClick={onClearTags}
              tooltip={translate('clearTagFilter')}
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
            />
          ) : null}
        </div>
      ) : null}

      <Select value={sort} onValueChange={onSortChange}>
        <SelectTrigger
          aria-label={translate('sortAria')}
          className="w-28 @[64rem]/library:w-40"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {sortOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {!isRecoveryView ? (
        <ViewToggle
          activeView={MODE_TO_VIEW_TYPE[viewMode]}
          onChange={(view) =>
            onViewModeChange(VIEW_TYPE_TO_MODE[view] ?? 'grid')
          }
          options={viewOptions}
          size={ComponentSize.SM}
        />
      ) : null}
    </div>
  );
}

export function LibraryBrowserIconActions({
  reviewUnsortedHref,
  isRefreshing,
  onRefresh,
  onUpload,
}: Pick<
  LibraryBrowserToolbarProps,
  'isRefreshing' | 'onRefresh' | 'onUpload' | 'reviewUnsortedHref'
>) {
  const translate = useTranslations('pages.library.browser.toolbar');
  return (
    <div
      className="flex items-center gap-1"
      data-testid="library-toolbar-icon-actions"
    >
      {reviewUnsortedHref ? (
        <Button
          asChild
          className={SHELL_ICON_BUTTON_CLASS}
          size={ButtonSize.ICON}
          variant={ButtonVariant.GHOST}
          tooltip={translate('startUnsortedReview')}
          withWrapper={false}
        >
          <Link
            href={reviewUnsortedHref}
            aria-label={translate('startUnsortedReview')}
          >
            <Sparkles className={SHELL_ICON_CLASS} />
          </Link>
        </Button>
      ) : null}
      <LibraryTagManagerDialog />
      <ButtonRefresh isRefreshing={isRefreshing} onClick={onRefresh} />
      <Button
        ariaLabel={translate('upload')}
        className={SHELL_ICON_BUTTON_CLASS}
        icon={<Upload className={SHELL_ICON_CLASS} />}
        onClick={onUpload}
        size={ButtonSize.ICON}
        tooltip={translate('upload')}
        variant={ButtonVariant.GHOST}
        withWrapper={false}
      />
    </div>
  );
}
