import {
  IngredientCategory,
  IngredientOrigin,
  LibraryPlace,
  LibraryShelf,
  TagMatchMode,
} from '@genfeedai/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

/** Opens the Filters menu and, when asked, one facet's submenu. */
async function openFilters(facet?: RegExp) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /^Filters/ }));
  if (facet) {
    screen.getByRole('menuitem', { name: facet }).focus();
    await user.keyboard('{ArrowRight}');
  }
  return user;
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

  it('offers shelves and Trash as one status filter and hides an idle Generating row', async () => {
    const onStatusChange = vi.fn();

    renderToolbar({
      onStatusChange,
      shelf: LibraryShelf.NEEDS_REVIEW,
      shelfCounts: {
        [LibraryShelf.FAILED]: 3,
        [LibraryShelf.GENERATING]: 0,
        [LibraryShelf.NEEDS_REVIEW]: 2,
      },
      trashedCount: 4,
    });
    const user = await openFilters(/^Status/);

    expect(
      screen.queryByRole('menuitemradio', { name: 'Generating' }),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByRole('menuitemradio', { name: 'Needs review (2)' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('menuitemradio', { name: 'Failed (3)' }));
    expect(onStatusChange).toHaveBeenCalledWith(LibraryShelf.FAILED);
  });

  it('sends Trash and All through the same status filter', async () => {
    const onStatusChange = vi.fn();

    renderToolbar({ onStatusChange, trashedCount: 4 });
    const user = await openFilters(/^Status/);
    await user.click(
      await screen.findByRole('menuitemradio', { name: 'Trash (4)' }),
    );
    expect(onStatusChange).toHaveBeenCalledWith('trash');
  });

  it('filters Recent and Starred from the show choices, not the nav (#5502)', async () => {
    const onPlaceChange = vi.fn();

    renderToolbar({ onPlaceChange, place: LibraryPlace.STARRED });
    const user = await openFilters(/^Show/);

    expect(
      await screen.findByRole('menuitemradio', { name: 'Starred' }),
    ).toBeChecked();
    await user.click(screen.getByRole('menuitemradio', { name: 'Recent' }));
    expect(onPlaceChange).toHaveBeenCalledWith(LibraryPlace.RECENT);
  });

  it('shows every asset in the show choices while Trash is the status', async () => {
    renderToolbar({ place: LibraryPlace.TRASH });
    await openFilters(/^Show/);

    expect(
      await screen.findByRole('menuitemradio', { name: 'All assets' }),
    ).toBeChecked();
  });

  it('hides presentation toggles only for grouped failure recovery', () => {
    renderToolbar({ isRecoveryView: true });

    expect(screen.queryByTestId('view-toggle')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument();
  });

  it('filters types from multi-select choices with singular labels', async () => {
    const onCategoriesChange = vi.fn();

    renderToolbar({
      categories: [IngredientCategory.VIDEO, IngredientCategory.VIDEO_EDIT],
      onCategoriesChange,
    });
    const user = await openFilters(/^Type/);

    expect(
      await screen.findByRole('menuitemcheckbox', { name: 'Video' }),
    ).toBeChecked();
    expect(
      screen.queryByRole('menuitemcheckbox', { name: 'Videos' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Image' }));

    expect(onCategoriesChange).toHaveBeenCalledWith([
      IngredientCategory.IMAGE,
      IngredientCategory.IMAGE_EDIT,
      IngredientCategory.VIDEO,
      IngredientCategory.VIDEO_EDIT,
    ]);
  });

  it('filters origin beside type', async () => {
    const onOriginsChange = vi.fn();

    renderToolbar({ onOriginsChange, origins: [IngredientOrigin.UPLOADED] });
    const user = await openFilters(/^Origin/);

    expect(
      await screen.findByRole('menuitemcheckbox', { name: 'Uploaded' }),
    ).toBeChecked();
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Generated' }),
    ).not.toBeChecked();

    await user.click(
      screen.getByRole('menuitemcheckbox', { name: 'Imported' }),
    );

    expect(onOriginsChange).toHaveBeenCalledWith([
      IngredientOrigin.UPLOADED,
      IngredientOrigin.IMPORTED,
    ]);
  });

  it('hides the character and tag facets when the brand has neither', async () => {
    renderToolbar();
    await openFilters();

    expect(
      screen.queryByRole('menuitem', { name: /^Character/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: /^Tags/ }),
    ).not.toBeInTheDocument();
  });

  it('filters by character', async () => {
    const onCharactersChange = vi.fn();

    renderToolbar({
      characterOptions: [
        { avatarIngredientId: 'img-1', id: 'c1', label: 'Anna' },
        { id: 'c2', label: 'Vincent' },
      ],
      characters: ['c1'],
      onCharactersChange,
    });
    const user = await openFilters(/^Character/);

    expect(
      await screen.findByRole('menuitemcheckbox', { name: 'Anna' }),
    ).toBeChecked();

    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Vincent' }));

    expect(onCharactersChange).toHaveBeenCalledWith(['c1', 'c2']);
  });

  it('stops offering characters at the API limit and says so', async () => {
    const characterOptions = Array.from({ length: 26 }, (_, index) => ({
      id: `c${index}`,
      label: `Character ${index}`,
    }));

    renderToolbar({
      characterOptions,
      characters: characterOptions.slice(0, 25).map((option) => option.id),
    });
    await openFilters(/^Character/);

    expect(
      await screen.findByText('Limit of 25 characters reached'),
    ).toBeVisible();
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Character 25' }),
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('searches long lists and keeps selected choices visible', async () => {
    const tagOptions = Array.from({ length: 12 }, (_, index) => ({
      id: `t${index}`,
      label: `Tag ${index}`,
    })) as ComponentProps<typeof LibraryBrowserToolbar>['tagOptions'];

    renderToolbar({ tagOptions, tags: ['t3'] });
    const user = await openFilters(/^Tags/);

    await user.type(
      await screen.findByRole('textbox', { name: 'Search tags' }),
      'Tag 11',
    );

    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Tag 11' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Tag 3' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitemcheckbox', { name: 'Tag 5' }),
    ).not.toBeInTheDocument();
  });

  describe('tag filter', () => {
    it('lists tags with their asset counts', async () => {
      const onTagsChange = vi.fn();

      renderToolbar({ onTagsChange, tagOptions: TAG_OPTIONS, tags: ['t1'] });
      const user = await openFilters(/^Tags/);

      expect(
        await screen.findByRole('menuitemcheckbox', { name: 'S1E12 (14)' }),
      ).toBeChecked();
      expect(
        screen.getByRole('menuitemcheckbox', { name: 'Launch (3)' }),
      ).not.toBeChecked();
      // A tag without a count is still listed, just unlabelled by one.
      expect(
        screen.getByRole('menuitemcheckbox', { name: 'Mood' }),
      ).toBeInTheDocument();

      await user.click(
        screen.getByRole('menuitemcheckbox', { name: 'Launch (3)' }),
      );

      expect(onTagsChange).toHaveBeenCalledWith(['t1', 't2']);
    });

    it('offers the match mode only once several tags are selected', async () => {
      renderToolbar({ tagOptions: TAG_OPTIONS, tags: ['t1'] });
      await openFilters();

      expect(
        screen.queryByRole('menuitem', { name: /^Tag match/ }),
      ).not.toBeInTheDocument();
    });

    it('switches between match any and match all', async () => {
      const onTagMatchChange = vi.fn();

      renderToolbar({
        onTagMatchChange,
        tagMatch: TagMatchMode.ANY,
        tagOptions: TAG_OPTIONS,
        tags: ['t1', 't2'],
      });
      const user = await openFilters(/^Tag match/);

      await user.click(
        await screen.findByRole('menuitemradio', { name: 'Match all' }),
      );
      expect(onTagMatchChange).toHaveBeenCalledWith(TagMatchMode.ALL);
    });

    it('stops offering tags at the API limit and says so', async () => {
      const manyTags = Array.from({ length: 26 }, (_, index) => ({
        id: `t${index}`,
        label: `Tag ${index}`,
      })) as ComponentProps<typeof LibraryBrowserToolbar>['tagOptions'];

      renderToolbar({
        tagOptions: manyTags,
        tags: manyTags.slice(0, 25).map((tag) => tag.id),
      });
      await openFilters(/^Tags/);

      expect(await screen.findByText('Limit of 25 tags reached')).toBeVisible();
      expect(
        screen.getByRole('menuitemcheckbox', { name: 'Tag 25' }),
      ).toHaveAttribute('aria-disabled', 'true');
    });

    it('offers tag management in the ghost action cluster', () => {
      render(<LibraryBrowserIconActions onUpload={vi.fn()} />);

      expect(
        screen.getByRole('button', { name: 'Manage tags' }),
      ).toBeInTheDocument();
    });
  });

  it('sorts from the menu and keeps sort out of the filter count', async () => {
    const onSortChange = vi.fn();

    renderToolbar({ onSortChange });

    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument();

    const user = await openFilters(/^Sort/);
    expect(
      await screen.findByRole('menuitemradio', { name: 'Newest first' }),
    ).toBeChecked();
    await user.click(
      screen.getByRole('menuitemradio', { name: 'Oldest first' }),
    );

    expect(onSortChange).toHaveBeenCalledWith('createdAt: 1');
  });

  it('hides clear-all until a filter is applied', async () => {
    renderToolbar();
    await openFilters();

    expect(
      screen.queryByRole('menuitem', { name: 'Clear all filters' }),
    ).not.toBeInTheDocument();
  });

  it('clears every filter from the menu once one is applied', async () => {
    const onClearAllFilters = vi.fn();

    renderToolbar({
      onClearAllFilters,
      origins: [IngredientOrigin.GENERATED],
    });
    const user = await openFilters();
    await user.click(
      screen.getByRole('menuitem', { name: 'Clear all filters' }),
    );

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
