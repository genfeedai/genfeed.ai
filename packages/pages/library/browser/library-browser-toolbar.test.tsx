import { IngredientCategory } from '@genfeedai/enums';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LibraryBrowserToolbar from './library-browser-toolbar';

const { useFeatureFlag } = vi.hoisted(() => ({
  useFeatureFlag: vi.fn(() => true),
}));

vi.mock('@hooks/feature-flags/use-feature-flag/use-feature-flag', () => ({
  useFeatureFlag,
}));

vi.mock('@ui/dropdowns/multiselect/DropdownMultiSelect', () => ({
  default: ({
    onChange,
    options,
    placeholder,
    values,
  }: {
    onChange: (name: string, values: string[]) => void;
    options: readonly { label: string; value: string }[];
    placeholder: string;
    values: string[];
  }) => (
    <div>
      <span>{placeholder}</span>
      {options.map((option) => (
        <button
          aria-pressed={values.includes(option.value)}
          key={option.value}
          onClick={() => {
            const next = values.includes(option.value)
              ? values.filter((value) => value !== option.value)
              : [...values, option.value];
            onChange('categories', next);
          }}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('@ui/buttons/dropdown/button-dropdown/ButtonDropdown', () => ({
  default: () => <div data-testid="sort-dropdown" />,
}));

vi.mock('@ui/buttons/refresh/button-refresh/ButtonRefresh', () => ({
  default: () => <div data-testid="refresh-button" />,
}));

vi.mock('@ui/navigation/view-toggle/ViewToggle', () => ({
  default: ({
    activeView,
    onChange,
    options,
  }: {
    activeView: string;
    onChange: (view: string) => void;
    options: readonly { label: string; type: string }[];
  }) => (
    <div data-testid="view-toggle">
      {options.map((option) => (
        <button
          aria-pressed={activeView === option.type}
          key={option.type}
          onClick={() => onChange(option.type)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  ),
}));

function renderToolbar(
  overrides: Partial<ComponentProps<typeof LibraryBrowserToolbar>> = {},
): void {
  render(
    <LibraryBrowserToolbar
      categories={[]}
      isRefreshing={false}
      onCategoriesChange={vi.fn()}
      onClearCategories={vi.fn()}
      onRefresh={vi.fn()}
      onSearchChange={vi.fn()}
      onSortChange={vi.fn()}
      onUpload={vi.fn()}
      onViewModeChange={vi.fn()}
      search=""
      sort="createdAt: -1"
      sortOptions={[{ label: 'Newest first', value: 'createdAt: -1' }]}
      viewMode="list"
      {...overrides}
    />,
  );
}

vi.mock('@ui/primitives/searchbar', () => ({
  default: () => <div data-testid="searchbar" />,
}));

describe('LibraryBrowserToolbar', () => {
  beforeEach(() => {
    useFeatureFlag.mockReturnValue(true);
  });

  it('filters types from a multi-select dropdown with singular labels', () => {
    const onCategoriesChange = vi.fn();

    render(
      <LibraryBrowserToolbar
        categories={[IngredientCategory.VIDEO, IngredientCategory.VIDEO_EDIT]}
        isRefreshing={false}
        onCategoriesChange={onCategoriesChange}
        onClearCategories={vi.fn()}
        onRefresh={vi.fn()}
        onSearchChange={vi.fn()}
        onSortChange={vi.fn()}
        onUpload={vi.fn()}
        onViewModeChange={vi.fn()}
        search=""
        sort="createdAt: -1"
        sortOptions={[{ label: 'Newest first', value: 'createdAt: -1' }]}
        viewMode="list"
      />,
    );

    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Video' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      screen.queryByRole('button', { name: 'Videos' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Image' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Image' }));

    expect(onCategoriesChange).toHaveBeenCalledWith([
      IngredientCategory.IMAGE,
      IngredientCategory.IMAGE_EDIT,
      IngredientCategory.VIDEO,
      IngredientCategory.VIDEO_EDIT,
    ]);
  });

  it('keeps ghost icon actions together after the bordered controls', () => {
    render(
      <LibraryBrowserToolbar
        categories={[]}
        isRefreshing={false}
        onCategoriesChange={vi.fn()}
        onClearCategories={vi.fn()}
        onRefresh={vi.fn()}
        onSearchChange={vi.fn()}
        onSortChange={vi.fn()}
        onUpload={vi.fn()}
        onViewModeChange={vi.fn()}
        search=""
        sort="createdAt: -1"
        sortOptions={[{ label: 'Newest first', value: 'createdAt: -1' }]}
        viewMode="list"
      />,
    );

    const iconActions = screen.getByTestId('library-toolbar-icon-actions');
    const rightCluster = iconActions.parentElement;

    expect(iconActions).toContainElement(screen.getByTestId('refresh-button'));
    expect(iconActions).toContainElement(
      screen.getByRole('button', { name: 'Upload' }),
    );
    expect(rightCluster?.lastElementChild).toBe(iconActions);
  });

  it('arranges the same result set three ways, canvas included', () => {
    const onViewModeChange = vi.fn();

    renderToolbar({ onViewModeChange, viewMode: 'canvas' });

    expect(
      screen.getByRole('button', { name: 'Contact sheet' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'List' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Canvas' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Contact sheet' }));

    expect(onViewModeChange).toHaveBeenCalledWith('grid');
  });

  it('drops the canvas option when its flag is off', () => {
    useFeatureFlag.mockReturnValue(false);

    renderToolbar();

    expect(
      screen.queryByRole('button', { name: 'Canvas' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
