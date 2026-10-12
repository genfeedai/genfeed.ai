import {
  IngredientCategory,
  IngredientOrigin,
  LibraryPlace,
  LibraryShelf,
  TagMatchMode,
} from '@genfeedai/contracts';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LibraryActiveFilters from './library-active-filters';
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

const SORT_OPTIONS = [
  { label: 'Newest first', value: 'createdAt: -1' },
  { label: 'Oldest first', value: 'createdAt: 1' },
];

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
      onClearAllFilters={vi.fn()}
      onOriginsChange={vi.fn()}
      onPlaceChange={vi.fn()}
      onSortChange={vi.fn()}
      onStatusChange={vi.fn()}
      onTagMatchChange={vi.fn()}
      onTagsChange={vi.fn()}
      origins={[]}
      onViewModeChange={vi.fn()}
      sort="createdAt: -1"
      sortOptions={SORT_OPTIONS}
      tagMatch={TagMatchMode.ANY}
      tagOptions={[]}
      tags={[]}
      viewMode="list"
      {...overrides}
    />,
  );
}

function openFilters(): void {
  fireEvent.click(screen.getByRole('button', { name: /^Filters/ }));
}

const TAG_OPTIONS = [
  { assetCount: 14, id: 't1', label: 'S1E12' },
  { assetCount: 3, id: 't2', label: 'Launch' },
  { id: 't3', label: 'Mood' },
] as ComponentProps<typeof LibraryBrowserToolbar>['tagOptions'];

describe('LibraryBrowserToolbar', () => {
  beforeEach(() => {
    useFeatureFlag.mockReturnValue(true);
  });

  it('puts every filter behind one Filters trigger and leaves the choices closed', () => {
    renderToolbar();

    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument();
    expect(screen.queryByText('Origin')).not.toBeInTheDocument();
    expect(screen.queryByText('Sort')).not.toBeInTheDocument();
    expect(screen.queryByText('Status')).not.toBeInTheDocument();
  });

  it('counts the applied filters on the trigger', () => {
    renderToolbar({
      categories: [IngredientCategory.VIDEO, IngredientCategory.VIDEO_EDIT],
      origins: [IngredientOrigin.UPLOADED],
      place: LibraryPlace.STARRED,
    });

    expect(screen.getByRole('button', { name: /^Filters/ })).toHaveTextContent(
      '3',
    );
  });

  it('offers shelves and Trash as one status filter and hides an idle Generating row', () => {
    const onStatusChange = vi.fn();

    renderToolbar({
      onStatusChange,
      shelfCounts: {
        [LibraryShelf.FAILED]: 3,
        [LibraryShelf.GENERATING]: 0,
        [LibraryShelf.NEEDS_REVIEW]: 2,
      },
      trashedCount: 4,
    });
    openFilters();

    expect(
      screen.queryByRole('radio', { name: 'Generating' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: 'Needs review (2)' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Failed (3)' }));
    expect(onStatusChange).toHaveBeenCalledWith(LibraryShelf.FAILED);
    fireEvent.click(screen.getByRole('radio', { name: 'Trash (4)' }));
    expect(onStatusChange).toHaveBeenCalledWith('trash');
    fireEvent.click(screen.getByRole('radio', { name: 'All' }));
    expect(onStatusChange).toHaveBeenCalledWith(null);
  });

  it('filters Recent and Starred from the show choices, not the nav (#5502)', () => {
    const onPlaceChange = vi.fn();

    renderToolbar({ onPlaceChange, place: LibraryPlace.STARRED });
    openFilters();

    const show = screen.getByRole('group', { name: 'Show' });
    expect(within(show).getByRole('radio', { name: 'Starred' })).toBeChecked();
    fireEvent.click(within(show).getByRole('radio', { name: 'Recent' }));
    expect(onPlaceChange).toHaveBeenCalledWith(LibraryPlace.RECENT);
    fireEvent.click(within(show).getByRole('radio', { name: 'All assets' }));
    expect(onPlaceChange).toHaveBeenCalledWith(null);
  });

  it('shows every asset in the show choices while Trash is the status', () => {
    renderToolbar({ place: LibraryPlace.TRASH });
    openFilters();

    const show = screen.getByRole('group', { name: 'Show' });
    expect(
      within(show).getByRole('radio', { name: 'All assets' }),
    ).toBeChecked();
  });

  it('hides presentation toggles only for grouped failure recovery', () => {
    renderToolbar({ isRecoveryView: true });

    expect(screen.queryByTestId('view-toggle')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument();
  });

  it('filters types from multi-select choices with singular labels', () => {
    const onCategoriesChange = vi.fn();

    renderToolbar({
      categories: [IngredientCategory.VIDEO, IngredientCategory.VIDEO_EDIT],
      onCategoriesChange,
    });
    openFilters();

    expect(screen.getByRole('button', { name: 'Video' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      screen.queryByRole('button', { name: 'Videos' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Image' }));

    expect(onCategoriesChange).toHaveBeenCalledWith([
      IngredientCategory.IMAGE,
      IngredientCategory.IMAGE_EDIT,
      IngredientCategory.VIDEO,
      IngredientCategory.VIDEO_EDIT,
    ]);
  });

  it('filters origin beside type', () => {
    const onOriginsChange = vi.fn();

    renderToolbar({ onOriginsChange, origins: [IngredientOrigin.UPLOADED] });
    openFilters();

    expect(screen.getByRole('button', { name: 'Uploaded' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Generated' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Imported' }));

    expect(onOriginsChange).toHaveBeenCalledWith([
      IngredientOrigin.UPLOADED,
      IngredientOrigin.IMPORTED,
    ]);
  });

  it('hides the character and tag sections when the brand has neither', () => {
    renderToolbar();
    openFilters();

    expect(screen.queryByText('Character')).not.toBeInTheDocument();
    expect(screen.queryByText('Tags')).not.toBeInTheDocument();
  });

  it('filters by character', () => {
    const onCharactersChange = vi.fn();

    renderToolbar({
      characterOptions: [
        { avatarIngredientId: 'img-1', id: 'c1', label: 'Anna' },
        { id: 'c2', label: 'Vincent' },
      ],
      characters: ['c1'],
      onCharactersChange,
    });
    openFilters();

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
    openFilters();

    expect(screen.getByRole('status')).toHaveTextContent(
      'Limit of 25 characters reached',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Character 25' }));

    expect(onCharactersChange).toHaveBeenCalledTimes(1);
    expect(onCharactersChange.mock.calls[0][0]).toHaveLength(25);
    expect(onCharactersChange.mock.calls[0][0]).not.toContain('c25');
  });

  it('searches long lists and keeps selected choices visible', () => {
    const tagOptions = Array.from({ length: 12 }, (_, index) => ({
      id: `t${index}`,
      label: `Tag ${index}`,
    })) as ComponentProps<typeof LibraryBrowserToolbar>['tagOptions'];

    renderToolbar({ tagOptions, tags: ['t3'] });
    openFilters();

    fireEvent.change(screen.getByRole('textbox', { name: 'Search tags' }), {
      target: { value: 'Tag 11' },
    });

    expect(screen.getByRole('button', { name: 'Tag 11' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tag 3' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Tag 5' }),
    ).not.toBeInTheDocument();
  });

  describe('tag filter', () => {
    it('lists tags with their asset counts', () => {
      const onTagsChange = vi.fn();

      renderToolbar({ onTagsChange, tagOptions: TAG_OPTIONS, tags: ['t1'] });
      openFilters();

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

    it('offers the match mode only once several tags are selected', () => {
      renderToolbar({ tagOptions: TAG_OPTIONS, tags: ['t1'] });
      openFilters();

      expect(
        screen.queryByRole('radio', { name: 'Match all' }),
      ).not.toBeInTheDocument();
    });

    it('switches between match any and match all', () => {
      const onTagMatchChange = vi.fn();

      renderToolbar({
        onTagMatchChange,
        tagMatch: TagMatchMode.ANY,
        tagOptions: TAG_OPTIONS,
        tags: ['t1', 't2'],
      });
      openFilters();

      fireEvent.click(screen.getByRole('radio', { name: 'Match all' }));
      expect(onTagMatchChange).toHaveBeenCalledWith(TagMatchMode.ALL);
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
      openFilters();

      expect(screen.getByRole('status')).toHaveTextContent(
        'Limit of 25 tags reached',
      );

      fireEvent.click(screen.getByRole('button', { name: 'Tag 25' }));

      expect(onTagsChange.mock.calls[0][0]).toHaveLength(25);
      expect(onTagsChange.mock.calls[0][0]).not.toContain('t25');
    });

    it('offers tag management in the ghost action cluster', () => {
      render(<LibraryBrowserIconActions onUpload={vi.fn()} />);

      expect(
        screen.getByRole('button', { name: 'Manage tags' }),
      ).toBeInTheDocument();
    });
  });

  it('sorts from the popover and keeps sort out of the filter count', () => {
    const onSortChange = vi.fn();

    renderToolbar({ onSortChange });

    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument();

    openFilters();
    const sort = screen.getByRole('group', { name: 'Sort' });
    expect(
      within(sort).getByRole('radio', { name: 'Newest first' }),
    ).toBeChecked();
    fireEvent.click(within(sort).getByRole('radio', { name: 'Oldest first' }));

    expect(onSortChange).toHaveBeenCalledWith('createdAt: 1');
  });

  it('hides the clear-all footer until a filter is applied', () => {
    renderToolbar();
    openFilters();

    expect(
      screen.queryByRole('button', { name: 'Clear all filters' }),
    ).not.toBeInTheDocument();
  });

  it('clears every filter from the popover footer once one is applied', () => {
    const onClearAllFilters = vi.fn();

    renderToolbar({
      onClearAllFilters,
      origins: [IngredientOrigin.GENERATED],
    });
    openFilters();
    fireEvent.click(screen.getByRole('button', { name: 'Clear all filters' }));

    expect(onClearAllFilters).toHaveBeenCalledOnce();
  });

  it('groups Upload in the shared ghost action slot, leaving Refresh to the topbar refresh slot', () => {
    const onUpload = vi.fn();
    render(<LibraryBrowserIconActions onUpload={onUpload} />);
    const iconActions = screen.getByTestId('library-toolbar-icon-actions');
    expect(screen.queryByTestId('refresh-button')).toBeNull();
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

describe('LibraryActiveFilters', () => {
  function renderActive(
    overrides: Partial<ComponentProps<typeof LibraryActiveFilters>> = {},
  ): void {
    render(
      <LibraryActiveFilters
        categories={[]}
        characterOptions={[]}
        characters={[]}
        onCategoriesChange={vi.fn()}
        onCharactersChange={vi.fn()}
        onClearAllFilters={vi.fn()}
        onOriginsChange={vi.fn()}
        onPlaceChange={vi.fn()}
        onStatusChange={vi.fn()}
        onTagMatchChange={vi.fn()}
        onTagsChange={vi.fn()}
        origins={[]}
        tagMatch={TagMatchMode.ANY}
        tagOptions={TAG_OPTIONS}
        tags={[]}
        {...overrides}
      />,
    );
  }

  it('renders nothing while no filter is applied', () => {
    renderActive();

    expect(screen.queryByTestId('library-active-filters')).toBeNull();
  });

  it('shows one removable chip per applied filter and removes only that one', () => {
    const onOriginsChange = vi.fn();
    const onTagsChange = vi.fn();
    const onStatusChange = vi.fn();

    renderActive({
      onOriginsChange,
      onStatusChange,
      onTagsChange,
      origins: [IngredientOrigin.GENERATED, IngredientOrigin.UPLOADED],
      shelf: LibraryShelf.APPROVED,
      tags: ['t1', 't2'],
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove Uploaded filter' }),
    );
    expect(onOriginsChange).toHaveBeenCalledWith([IngredientOrigin.GENERATED]);

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove S1E12 filter' }),
    );
    expect(onTagsChange).toHaveBeenCalledWith(['t2']);

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove Approved filter' }),
    );
    expect(onStatusChange).toHaveBeenCalledWith(null);
  });

  it('removes one grouped type without dropping the others', () => {
    const onCategoriesChange = vi.fn();

    renderActive({
      categories: [
        IngredientCategory.VIDEO,
        IngredientCategory.VIDEO_EDIT,
        IngredientCategory.IMAGE,
        IngredientCategory.IMAGE_EDIT,
      ],
      onCategoriesChange,
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove Video filter' }),
    );

    expect(onCategoriesChange).toHaveBeenCalledWith([
      IngredientCategory.IMAGE,
      IngredientCategory.IMAGE_EDIT,
    ]);
  });

  it('keeps a filter removable when its option is gone', () => {
    const onTagsChange = vi.fn();

    renderActive({ onTagsChange, tags: ['deleted'] });

    fireEvent.click(screen.getByRole('button', { name: 'Remove Tags filter' }));

    expect(onTagsChange).toHaveBeenCalledWith([]);
  });

  it('offers clear all only when several filters are applied', () => {
    renderActive({ origins: [IngredientOrigin.GENERATED] });
    expect(
      screen.queryByRole('button', { name: 'Clear all filters' }),
    ).not.toBeInTheDocument();
  });

  it('clears everything at once from the chip row', () => {
    const onClearAllFilters = vi.fn();

    renderActive({
      onClearAllFilters,
      origins: [IngredientOrigin.GENERATED],
      place: LibraryPlace.RECENT,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Clear all filters' }));

    expect(onClearAllFilters).toHaveBeenCalledOnce();
  });
});

it('starts an Agent review request from Unsorted', () => {
  render(
    <LibraryBrowserIconActions
      onUpload={vi.fn()}
      reviewUnsortedHref="/org/brand/agent/new?prompt=review-unsorted"
    />,
  );
  expect(
    screen.getByRole('link', { name: 'Start Unsorted review with Agent' }),
  ).toHaveAttribute('href', '/org/brand/agent/new?prompt=review-unsorted');
});
