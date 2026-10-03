'use client';

import {
  ButtonSize,
  ButtonVariant,
  ComponentSize,
  INGREDIENT_ORIGIN_LABELS,
  INGREDIENT_ORIGIN_ORDER,
  parseIngredientOrigin,
  ViewType,
} from '@genfeedai/contracts';
import {
  LIBRARY_CANVAS_FEATURE_FLAG,
  LIBRARY_MAX_CHARACTER_FILTERS,
  type LibraryViewMode,
} from '@genfeedai/contracts/constants';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useFeatureFlag } from '@hooks/feature-flags/use-feature-flag/use-feature-flag';
import type {
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
import {
  SHELL_ICON_BUTTON_CLASS,
  SHELL_ICON_CLASS,
} from '@ui-constants/shell-chrome.constant';
import {
  categoriesFromAssetTypeIds,
  selectedAssetTypeIds,
} from '@utils/media/library-asset-type.util';
import { Frame, LayoutGrid, Rows3, Upload, UserRound, X } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { LIBRARY_TYPE_CHIPS } from './library-browser.config';

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
 * The Library's control plane: the type and origin filters as multi-select
 * dropdowns, plus search, sort and density. The shelf and folder axes are *not*
 * here — a shelf is the route and a folder is the sidebar, so putting either in
 * this row would re-collapse the three axes the redesign just separated. Origin
 * is a filter like type, not a destination: it never gets a nav entry, and
 * neither does character.
 */
export default function LibraryBrowserToolbar({
  categories,
  characterOptions,
  characters,
  origins,
  sort,
  sortOptions,
  viewMode,
  onCategoriesChange,
  onCharactersChange,
  onClearCategories,
  onClearCharacters,
  onClearOrigins,
  onOriginsChange,
  onSortChange,
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
  const selectedTypeIds = selectedAssetTypeIds(categories);
  const isCanvasEnabled = useFeatureFlag(LIBRARY_CANVAS_FEATURE_FLAG);

  const characterDropdownOptions = useMemo(
    () =>
      characterOptions.map((character) => ({
        icon: <CharacterAvatar character={character} />,
        label: character.label,
        value: character.id,
      })),
    [characterOptions],
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
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <div className="flex min-w-0 items-center gap-1.5">
        <DropdownMultiSelect
          className={cn(
            fieldControlClassName,
            fieldControlTriggerClassName,
            'w-32',
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
            'w-32',
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
              'w-32',
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

      <Select value={sort} onValueChange={onSortChange}>
        <SelectTrigger aria-label={translate('sortAria')} className="w-40">
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

      <ViewToggle
        activeView={MODE_TO_VIEW_TYPE[viewMode]}
        onChange={(view) => onViewModeChange(VIEW_TYPE_TO_MODE[view] ?? 'grid')}
        options={viewOptions}
        size={ComponentSize.SM}
      />
    </div>
  );
}

export function LibraryBrowserIconActions({
  isRefreshing,
  onRefresh,
  onUpload,
}: Pick<
  LibraryBrowserToolbarProps,
  'isRefreshing' | 'onRefresh' | 'onUpload'
>) {
  const translate = useTranslations('pages.library.browser.toolbar');
  return (
    <div
      className="flex items-center gap-1"
      data-testid="library-toolbar-icon-actions"
    >
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
