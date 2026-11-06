import { TagBulkAction, TagScope } from '@genfeedai/contracts';
import { LIBRARY_BULK_TAG_LIMIT } from '@genfeedai/contracts/constants';
import type { IIngredient, ITag } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SelectionTagAction from './SelectionTagAction';

/**
 * In-memory library: the brand's tags, the selected assets' tags (pushed to
 * the rendered harness on every write), and the toasts the user saw.
 */
const library = vi.hoisted(() => ({
  assetTags: {} as Record<string, ITag[]>,
  failCreate: false,
  notified: [] as string[],
  render: (): void => undefined,
  tags: [] as ITag[],
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ brandId: 'brand-1' }),
}));

vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: (message: string) => {
        library.notified.push(message);
      },
      success: () => undefined,
    }),
  },
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: { error: () => undefined },
}));

const launch = {
  backgroundColor: '#000000',
  id: 'tag-launch',
  label: 'Launch',
  scope: TagScope.BRAND,
  textColor: '#ffffff',
} as ITag;
const episode = {
  backgroundColor: '#112233',
  id: 'tag-episode',
  label: 'S1E12',
  scope: TagScope.ORGANIZATION,
  textColor: '#ffffff',
} as ITag;

vi.mock('@/components/tags/library-tag-picker/use-library-tags', () => ({
  useLibraryTags: () => ({
    createTag: async (label: string) => {
      if (library.failCreate) throw new Error('boom');
      const created = { ...library.tags[0], id: `tag-${label}`, label } as ITag;
      library.tags = [...library.tags, created];
      return created;
    },
    isLoading: false,
    refresh: () => undefined,
    tags: library.tags,
  }),
}));

vi.mock('@/components/tags/library-tag-picker/use-library-tag-writes', () => ({
  useLibraryTagWrites: () => ({
    applyTag: async (action: string, tag: ITag, ids: string[]) => {
      for (const id of ids) {
        const current = library.assetTags[id] ?? [];
        library.assetTags[id] =
          action === TagBulkAction.REMOVE
            ? current.filter((item) => item.id !== tag.id)
            : [...current.filter((item) => item.id !== tag.id), tag];
      }
      library.render();
      return {
        changedIds: ids,
        result: { changed: ids.length, failed: 0, skipped: 0 },
      };
    },
    isWriting: false,
  }),
}));

vi.mock('@/components/tags/library-tag-picker/LibraryTagPicker', () => ({
  default: ({
    onCreate,
    onToggle,
    states,
    tags,
    trigger,
  }: {
    onCreate: (label: string) => void;
    onToggle: (tag: ITag, state: 'all' | 'some' | undefined) => void;
    states?: ReadonlyMap<string, 'all' | 'some'>;
    tags: readonly ITag[];
    trigger: React.ReactNode;
  }) => (
    <div>
      {trigger}
      {tags.map((tag) => (
        <button
          data-state={states?.get(tag.id) ?? 'none'}
          key={tag.id}
          onClick={() => onToggle(tag, states?.get(tag.id))}
          type="button"
        >
          {`pick ${tag.label}`}
        </button>
      ))}
      <button onClick={() => onCreate('Spring drop')} type="button">
        create tag
      </button>
    </div>
  ),
}));

function assets(count: number, tags: Record<number, ITag[]> = {}) {
  return Array.from(
    { length: count },
    (_, index) => ({ id: `asset-${index}`, tags: tags[index] }) as IIngredient,
  );
}

/** Renders the action over the library's current asset tags. */
function SelectionHarness({ selection }: { selection: IIngredient[] }) {
  const [, setVersion] = useState(0);
  useEffect(() => {
    library.assetTags = Object.fromEntries(
      selection.map((asset) => [asset.id, asset.tags ?? []]),
    );
    library.render = () => setVersion((version) => version + 1);
  }, [selection]);
  const current = selection.map(
    (asset) =>
      ({
        ...asset,
        tags: library.assetTags[asset.id] ?? asset.tags,
      }) as IIngredient,
  );
  return <SelectionTagAction selectedIngredients={current} />;
}

const tagState = (label: string) =>
  screen
    .getByRole('button', { name: `pick ${label}` })
    .getAttribute('data-state');

describe('SelectionTagAction', () => {
  beforeEach(() => {
    library.assetTags = {};
    library.failCreate = false;
    library.notified = [];
    library.render = () => undefined;
    library.tags = [launch, episode];
  });

  it('adds a tag to every selected asset in one action', async () => {
    render(<SelectionHarness selection={assets(3)} />);

    fireEvent.click(screen.getByRole('button', { name: 'pick Launch' }));

    await waitFor(() => expect(tagState('Launch')).toBe('all'));
    expect(library.assetTags).toEqual({
      'asset-0': [launch],
      'asset-1': [launch],
      'asset-2': [launch],
    });
  });

  it('marks a tag every selected asset carries, and removes it from all of them', async () => {
    render(
      <SelectionHarness selection={assets(2, { 0: [launch], 1: [launch] })} />,
    );

    expect(screen.getByRole('button', { name: 'pick Launch' })).toHaveAttribute(
      'data-state',
      'all',
    );

    fireEvent.click(screen.getByRole('button', { name: 'pick Launch' }));

    await waitFor(() => expect(tagState('Launch')).toBe('none'));
    expect(library.assetTags).toEqual({ 'asset-0': [], 'asset-1': [] });
  });

  it('marks a tag on only some assets, and adds it to the rest when picked', async () => {
    render(<SelectionHarness selection={assets(3, { 0: [launch] })} />);

    expect(screen.getByRole('button', { name: 'pick Launch' })).toHaveAttribute(
      'data-state',
      'some',
    );
    expect(screen.getByRole('button', { name: 'pick S1E12' })).toHaveAttribute(
      'data-state',
      'none',
    );

    fireEvent.click(screen.getByRole('button', { name: 'pick Launch' }));

    await waitFor(() => expect(tagState('Launch')).toBe('all'));
    expect(tagState('S1E12')).toBe('none');
  });

  it('creates a tag and applies it to the whole selection', async () => {
    render(<SelectionHarness selection={assets(2)} />);

    fireEvent.click(screen.getByRole('button', { name: 'create tag' }));

    await waitFor(() => expect(tagState('Spring drop')).toBe('all'));
    expect(library.assetTags['asset-1']).toEqual([
      expect.objectContaining({ label: 'Spring drop' }),
    ]);
  });

  it('reports a tag it could not create instead of tagging anything', async () => {
    library.failCreate = true;
    render(<SelectionHarness selection={assets(2)} />);

    fireEvent.click(screen.getByRole('button', { name: 'create tag' }));

    await waitFor(() =>
      expect(library.notified).toEqual(['The tag could not be created.']),
    );
    expect(library.assetTags).toEqual({ 'asset-0': [], 'asset-1': [] });
  });

  it('tags exactly the limit of assets', () => {
    render(
      <SelectionTagAction
        selectedIngredients={assets(LIBRARY_BULK_TAG_LIMIT)}
      />,
    );

    expect(screen.getByRole('button', { name: /Tag/ })).toBeEnabled();
  });

  it('refuses more than the limit and says why', () => {
    render(
      <SelectionTagAction
        selectedIngredients={assets(LIBRARY_BULK_TAG_LIMIT + 1)}
      />,
    );

    const trigger = screen.getByRole('button', { name: /^Tag$/ });
    expect(trigger).toBeDisabled();
  });

  it('is disabled with nothing selected', () => {
    render(<SelectionTagAction selectedIngredients={[]} />);

    expect(screen.getByRole('button', { name: /^Tag$/ })).toBeDisabled();
  });
});
