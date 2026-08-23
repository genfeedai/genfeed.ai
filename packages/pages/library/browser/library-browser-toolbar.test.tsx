import { IngredientCategory } from '@genfeedai/enums';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import LibraryBrowserToolbar from './library-browser-toolbar';

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
  default: () => <div data-testid="view-toggle" />,
}));

vi.mock('@ui/primitives/searchbar', () => ({
  default: () => <div data-testid="searchbar" />,
}));

describe('LibraryBrowserToolbar', () => {
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
});
