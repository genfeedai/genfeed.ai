'use client';

import {
  ButtonSize,
  ButtonVariant,
  ComponentSize,
  ViewType,
} from '@genfeedai/contracts';
import {
  LIBRARY_CANVAS_FEATURE_FLAG,
  type LibraryViewMode,
} from '@genfeedai/contracts/constants';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useFeatureFlag } from '@hooks/feature-flags/use-feature-flag/use-feature-flag';
import type { LibraryBrowserToolbarProps } from '@props/pages/library-browser.props';
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
import { Frame, LayoutGrid, Rows3, Upload, X } from 'lucide-react';
import { useMemo } from 'react';

import { LIBRARY_TYPE_CHIPS } from './library-browser.config';

const GRID_VIEW_OPTION = {
  icon: <LayoutGrid className={SHELL_ICON_CLASS} />,
  label: 'Contact sheet',
  type: ViewType.GRID,
};

const LIST_VIEW_OPTION = {
  icon: <Rows3 className={SHELL_ICON_CLASS} />,
  label: 'List',
  type: ViewType.LIST,
};

const CANVAS_VIEW_OPTION = {
  icon: <Frame className={SHELL_ICON_CLASS} />,
  label: 'Canvas',
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

/**
 * The Library's control plane: the type axis as a multi-select dropdown, plus
 * search, sort and density. The shelf and folder axes are *not* here — a shelf
 * is the route and a folder is the sidebar, so putting either in this row would
 * re-collapse the three axes the redesign just separated.
 */
export default function LibraryBrowserToolbar({
  categories,
  sort,
  sortOptions,
  viewMode,
  isRefreshing,
  onCategoriesChange,
  onClearCategories,
  onSortChange,
  onViewModeChange,
  onRefresh,
  onUpload,
}: LibraryBrowserToolbarProps) {
  const hasTypeFilter = categories.length > 0;
  const selectedTypeIds = selectedAssetTypeIds(categories);
  const isCanvasEnabled = useFeatureFlag(LIBRARY_CANVAS_FEATURE_FLAG);

  const viewOptions = useMemo(
    () =>
      isCanvasEnabled
        ? [GRID_VIEW_OPTION, LIST_VIEW_OPTION, CANVAS_VIEW_OPTION]
        : [GRID_VIEW_OPTION, LIST_VIEW_OPTION],
    [isCanvasEnabled],
  );

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
          placeholder="Type"
          values={selectedTypeIds}
        />

        {hasTypeFilter ? (
          <Button
            className="h-7 rounded-full px-2 text-xs text-foreground/50 hover:text-foreground"
            icon={<X className="size-3.5" />}
            onClick={onClearCategories}
            tooltip="Clear type filter"
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
          />
        ) : null}
      </div>

      <Select value={sort} onValueChange={onSortChange}>
        <SelectTrigger aria-label="Sort" className="w-40">
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

      <div
        className="flex items-center gap-1"
        data-testid="library-toolbar-icon-actions"
      >
        <ButtonRefresh isRefreshing={isRefreshing} onClick={onRefresh} />
        <Button
          ariaLabel="Upload"
          className={SHELL_ICON_BUTTON_CLASS}
          icon={<Upload className={SHELL_ICON_CLASS} />}
          onClick={onUpload}
          size={ButtonSize.ICON}
          tooltip="Upload"
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        />
      </div>
    </div>
  );
}
