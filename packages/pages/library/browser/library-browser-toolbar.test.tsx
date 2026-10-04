import {
  IngredientCategory,
  IngredientOrigin,
  TagMatchMode,
} from '@genfeedai/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  useContext,
} from 'react';
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

const SelectValueContext = createContext<(value: string) => void>(() => {});

vi.mock('@ui/primitives/select', () => ({
  Select: ({
    children,
    onValueChange,
    value,
  }: {
    children?: ReactNode;
    onValueChange?: (value: string) => void;
    value?: string;
  }) => (
    <SelectValueContext.Provider value={onValueChange ?? (() => {})}>
      <div data-select-value={value} data-testid="select">
        {children}
      </div>
    </SelectValueContext.Provider>
  ),
  SelectContent: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: function SelectItemMock({
    children,
    value,
  }: {
    children?: ReactNode;
    value: string;
  }) {
    const onValueChange = useContext(SelectValueContext);
    return (
      <button onClick={() => onValueChange(value)} type="button">
        {children}
      </button>
    );
  },
  SelectTrigger: ({
    'aria-label': ariaLabel,
    children,
  }: {
    'aria-label'?: string;
    children?: ReactNode;
  }) => (
    <button aria-label={ariaLabel} type="button">
      {children}
    </button>
  ),
  SelectValue: () => <span>Newest first</span>,
}));

vi.mock('@ui/tags/library-tag-picker/LibraryTagManagerDialog', () => ({
  default: () => <button type="button">Manage tags</button>,
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
      onClearTags={vi.fn()}
      onOriginsChange={vi.fn()}
      onSortChange={vi.fn()}
      onTagMatchChange={vi.fn()}
      onTagsChange={vi.fn()}
      origins={[]}
      onViewModeChange={vi.fn()}
      sort="createdAt: -1"
      sortOptions={[{ label: 'Newest first', value: 'createdAt: -1' }]}
      tagMatch={TagMatchMode.ANY}
      tagOptions={[]}
      tags={[]}
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
        onClearTags={vi.fn()}
        onOriginsChange={vi.fn()}
        onSortChange={vi.fn()}
        onTagMatchChange={vi.fn()}
        onTagsChange={vi.fn()}
        origins={[]}
        onViewModeChange={vi.fn()}
        sort="createdAt: -1"
        sortOptions={[{ label: 'Newest first', value: 'createdAt: -1' }]}
        tagMatch={TagMatchMode.ANY}
        tagOptions={[]}
        tags={[]}
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

  it('caps the character selection at the API limit and shows it', () => {
    const onCharactersChange = vi.fn();
    const characterOptions = Array.from({ length: 26 }, (_, index) => ({
      id: `c${index}`,
      label: `Character ${index}`,
    }));

    renderToolbar({
      characterOptions,
      characters: characterOptions.slice(0, 25).map((option) => option.id),
      onCharactersChange,
    });

    expect(screen.getByRole('status')).toHaveTextContent(
      'Limit of 25 characters reached',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Character 25' }));

    expect(onCharactersChange).toHaveBeenCalledTimes(1);
    expect(onCharactersChange.mock.calls[0][0]).toHaveLength(25);
    expect(onCharactersChange.mock.calls[0][0]).not.toContain('c25');
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

  describe('tag filter', () => {
    const tagOptions = [
      { assetCount: 14, id: 't1', label: 'S1E12' },
      { assetCount: 3, id: 't2', label: 'Launch' },
      { id: 't3', label: 'Mood' },
    ] as ComponentProps<typeof LibraryBrowserToolbar>['tagOptions'];

    it('hides the tag filter when the brand has no tags', () => {
      renderToolbar();

      expect(screen.queryByText('Tags')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Manage tags' }),
      ).not.toBeInTheDocument();
    });

    it('lists tags with their asset counts beside the other filters', () => {
      const onTagsChange = vi.fn();

      renderToolbar({ onTagsChange, tagOptions, tags: ['t1'] });

      expect(screen.getByText('Tags')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'S1E12 (14)' }),
      ).toHaveAttribute('aria-pressed', 'true');
      expect(
        screen.getByRole('button', { name: 'Launch (3)' }),
      ).toHaveAttribute('aria-pressed', 'false');
      // A tag without a count is still listed, just unlabelled by one.
      expect(screen.getByRole('button', { name: 'Mood' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Launch (3)' }));

      expect(onTagsChange).toHaveBeenCalledWith(['t1', 't2']);
    });

    it('keeps the filter clearable when its tags are gone', () => {
      const onClearTags = vi.fn();

      renderToolbar({ onClearTags, tags: ['deleted'] });

      fireEvent.click(screen.getByRole('button', { name: 'Clear tag filter' }));

      expect(onClearTags).toHaveBeenCalledTimes(1);
    });

    it('offers the match mode only once several tags are selected', () => {
      renderToolbar({ tagOptions, tags: ['t1'] });

      expect(
        screen.queryByRole('button', { name: 'How the selected tags combine' }),
      ).not.toBeInTheDocument();
    });

    it('switches between match any and match all', () => {
      const onTagMatchChange = vi.fn();

      renderToolbar({
        onTagMatchChange,
        tagMatch: TagMatchMode.ANY,
        tagOptions,
        tags: ['t1', 't2'],
      });

      expect(
        screen.getByRole('button', { name: 'How the selected tags combine' }),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Match all' }));
      expect(onTagMatchChange).toHaveBeenCalledWith(TagMatchMode.ALL);

      fireEvent.click(screen.getByRole('button', { name: 'Match any' }));
      expect(onTagMatchChange).toHaveBeenCalledWith(TagMatchMode.ANY);
    });

    it('caps the tag selection at the API limit and shows it', () => {
      const onTagsChange = vi.fn();
      const manyTags = Array.from({ length: 26 }, (_, index) => ({
        id: `t${index}`,
        label: `Tag ${index}`,
      })) as ComponentProps<typeof LibraryBrowserToolbar>['tagOptions'];

      renderToolbar({
        onTagsChange,
        tagOptions: manyTags,
        tags: manyTags.slice(0, 25).map((tag) => tag.id),
      });

      expect(screen.getByRole('status')).toHaveTextContent(
        'Limit of 25 tags reached',
      );

      fireEvent.click(screen.getByRole('button', { name: 'Tag 25' }));

      expect(onTagsChange.mock.calls[0][0]).toHaveLength(25);
      expect(onTagsChange.mock.calls[0][0]).not.toContain('t25');
    });

    it('offers tag management beside the filter', () => {
      renderToolbar({ tagOptions });

      expect(
        screen.getByRole('button', { name: 'Manage tags' }),
      ).toBeInTheDocument();
    });
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
