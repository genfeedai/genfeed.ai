import { IngredientCategory, IngredientOrigin } from '@genfeedai/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LibraryBrowserToolbar, {
  LibraryBrowserIconActions,
} from './library-browser-toolbar';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

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

vi.mock('@ui/primitives/select', () => ({
  Select: ({ children }: { children?: ReactNode }) => (
    <div data-testid="sort-select">{children}</div>
  ),
  SelectContent: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children?: ReactNode }) => (
    <button type="button">{children}</button>
  ),
  SelectValue: () => <span>Newest first</span>,
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
      characterOptions={[]}
      characters={[]}
      onCategoriesChange={vi.fn()}
      onCharactersChange={vi.fn()}
      onClearCategories={vi.fn()}
      onClearCharacters={vi.fn()}
      onClearOrigins={vi.fn()}
      onOriginsChange={vi.fn()}
      onSortChange={vi.fn()}
      origins={[]}
      onViewModeChange={vi.fn()}
      sort="createdAt: -1"
      sortOptions={[{ label: 'Newest first', value: 'createdAt: -1' }]}
      viewMode="list"
      {...overrides}
    />,
  );
}

describe('LibraryBrowserToolbar', () => {
  beforeEach(() => {
    useFeatureFlag.mockReturnValue(true);
  });

  it('filters types from a multi-select dropdown with singular labels', () => {
    const onCategoriesChange = vi.fn();

    render(
      <LibraryBrowserToolbar
        categories={[IngredientCategory.VIDEO, IngredientCategory.VIDEO_EDIT]}
        characterOptions={[]}
        characters={[]}
        onCategoriesChange={onCategoriesChange}
        onCharactersChange={vi.fn()}
        onClearCategories={vi.fn()}
        onClearCharacters={vi.fn()}
        onClearOrigins={vi.fn()}
        onOriginsChange={vi.fn()}
        onSortChange={vi.fn()}
        origins={[]}
        onViewModeChange={vi.fn()}
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

  it('filters origin from its own multi-select, beside type', () => {
    const onOriginsChange = vi.fn();

    renderToolbar({
      onOriginsChange,
      origins: [IngredientOrigin.UPLOADED],
    });

    expect(screen.getByText('Origin')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Uploaded' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Generated' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(
      screen.getByRole('button', { name: 'Imported' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Imported' }));

    expect(onOriginsChange).toHaveBeenCalledWith([
      IngredientOrigin.UPLOADED,
      IngredientOrigin.IMPORTED,
    ]);
  });

  it('hides the character filter when the brand has no characters', () => {
    renderToolbar();

    expect(screen.queryByText('Character')).not.toBeInTheDocument();
  });

  it('filters by character from a searchable multi-select beside origin', () => {
    const onCharactersChange = vi.fn();

    renderToolbar({
      characterOptions: [
        { avatarIngredientId: 'img-1', id: 'c1', label: 'Anna' },
        { id: 'c2', label: 'Vincent' },
      ],
      characters: ['c1'],
      onCharactersChange,
    });

    expect(screen.getByText('Character')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anna' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Vincent' }));

    expect(onCharactersChange).toHaveBeenCalledWith(['c1', 'c2']);
  });

  it('clears only the character filter, and keeps it clearable without options', () => {
    const onClearCharacters = vi.fn();
    const onClearOrigins = vi.fn();

    renderToolbar({
      characters: ['gone'],
      onClearCharacters,
      onClearOrigins,
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Clear character filter' }),
    );

    expect(onClearCharacters).toHaveBeenCalledTimes(1);
    expect(onClearOrigins).not.toHaveBeenCalled();
  });

  it('keeps origin out of the type filter and clears only itself', () => {
    const onClearOrigins = vi.fn();
    const onClearCategories = vi.fn();

    renderToolbar({
      onClearCategories,
      onClearOrigins,
      origins: [IngredientOrigin.GENERATED],
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Clear origin filter' }),
    );

    expect(onClearOrigins).toHaveBeenCalledOnce();
    expect(onClearCategories).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: 'Clear type filter' }),
    ).not.toBeInTheDocument();
  });

  it('hides the clear control when no origin is selected', () => {
    renderToolbar();

    expect(
      screen.queryByRole('button', { name: 'Clear origin filter' }),
    ).not.toBeInTheDocument();
  });

  it('groups Refresh and Upload for the shared ghost action slot', () => {
    const onUpload = vi.fn();
    render(
      <LibraryBrowserIconActions
        isRefreshing={false}
        onRefresh={vi.fn()}
        onUpload={onUpload}
      />,
    );
    const iconActions = screen.getByTestId('library-toolbar-icon-actions');
    expect(iconActions).toContainElement(screen.getByTestId('refresh-button'));
    expect(iconActions).toContainElement(
      screen.getByRole('button', { name: 'Upload' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
    expect(onUpload).toHaveBeenCalledTimes(1);
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

    fireEvent.click(screen.getByRole('button', { name: 'List' }));

    expect(onViewModeChange).toHaveBeenCalledWith('list');
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
