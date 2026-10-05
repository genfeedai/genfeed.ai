import { TagBulkAction, TagScope } from '@genfeedai/contracts';
import type { IIngredient, ITag } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import IngredientTagsControl from './IngredientTagsControl';

const { applyTag, createTag, libraryTags, notifications } = vi.hoisted(() => ({
  applyTag: vi.fn(),
  createTag: vi.fn(),
  libraryTags: { isLoading: false, tags: [] as unknown[] },
  notifications: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ brandId: 'brand-1' }),
}));

vi.mock('@ui/tags/library-tag-picker/use-library-tags', () => ({
  useLibraryTags: ({ brandId }: { brandId?: string }) => ({
    createTag,
    isLoading: libraryTags.isLoading,
    refresh: vi.fn(),
    tags: brandId === 'brand-1' ? libraryTags.tags : [],
  }),
}));

vi.mock('@ui/tags/library-tag-picker/use-library-tag-writes', () => ({
  useLibraryTagWrites: () => ({ applyTag, isWriting: false }),
}));

vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: { getInstance: () => notifications },
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

vi.mock('@ui/tags/library-tag-picker/LibraryTagPicker', () => ({
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

function ingredient(tags?: ITag[]): IIngredient {
  return { id: 'asset-1', tags } as IIngredient;
}

describe('IngredientTagsControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    libraryTags.isLoading = false;
    libraryTags.tags = [launch, episode];
    applyTag.mockImplementation(
      async (_action: TagBulkAction, _tag: ITag, ids: string[]) => ({
        changedIds: ids,
        result: { changed: ids.length, failed: 0, skipped: 0 },
      }),
    );
  });

  it('shows the asset’s tags as chips, and guidance when it has none', () => {
    const { rerender } = render(
      <IngredientTagsControl ingredient={ingredient([launch])} />,
    );

    expect(screen.getByText('Launch')).toBeInTheDocument();
    expect(
      screen.queryByText(/No tags yet. Use tags for campaign/),
    ).not.toBeInTheDocument();

    rerender(<IngredientTagsControl ingredient={ingredient()} />);

    expect(
      screen.getByText(/No tags yet. Use tags for campaign/),
    ).toBeInTheDocument();
  });

  it('adds a tag to this one asset in two interactions: open, then pick', async () => {
    render(<IngredientTagsControl ingredient={ingredient()} />);

    expect(screen.getByRole('button', { name: 'Add tag' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'pick S1E12' }));

    await waitFor(() =>
      expect(applyTag).toHaveBeenCalledWith(TagBulkAction.ADD, episode, [
        'asset-1',
      ]),
    );
    expect(await screen.findByText('S1E12')).toBeInTheDocument();
  });

  it('removes a tag from this asset with its remove button', async () => {
    render(
      <IngredientTagsControl ingredient={ingredient([launch, episode])} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove tag Launch' }));

    await waitFor(() =>
      expect(applyTag).toHaveBeenCalledWith(TagBulkAction.REMOVE, launch, [
        'asset-1',
      ]),
    );
    await waitFor(() =>
      expect(screen.queryByText('Launch')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('S1E12')).toBeInTheDocument();
  });

  it('removes a tag that is already on the asset when it is picked again', async () => {
    render(<IngredientTagsControl ingredient={ingredient([launch])} />);

    fireEvent.click(screen.getByRole('button', { name: 'pick Launch' }));

    await waitFor(() =>
      expect(applyTag).toHaveBeenCalledWith(TagBulkAction.REMOVE, launch, [
        'asset-1',
      ]),
    );
  });

  it('creates a new label and attaches it in the same action', async () => {
    const created = {
      ...launch,
      id: 'tag-spring',
      label: 'Spring drop',
    } as ITag;
    createTag.mockResolvedValue(created);
    render(<IngredientTagsControl ingredient={ingredient()} />);

    fireEvent.click(screen.getByRole('button', { name: 'create tag' }));

    await waitFor(() =>
      expect(applyTag).toHaveBeenCalledWith(TagBulkAction.ADD, created, [
        'asset-1',
      ]),
    );
    expect(createTag).toHaveBeenCalledWith('Spring drop', undefined, undefined);
    expect(await screen.findByText('Spring drop')).toBeInTheDocument();
  });

  it('says so when the tag could not be created, and attaches nothing', async () => {
    createTag.mockRejectedValue(new Error('403'));
    render(<IngredientTagsControl ingredient={ingredient()} />);

    fireEvent.click(screen.getByRole('button', { name: 'create tag' }));

    await waitFor(() =>
      expect(notifications.error).toHaveBeenCalledWith(
        'The tag could not be created.',
      ),
    );
    expect(applyTag).not.toHaveBeenCalled();
  });

  it('does not show a tag the write did not apply', async () => {
    applyTag.mockResolvedValue({
      changedIds: [],
      result: { changed: 0, failed: 1, skipped: 0 },
    });
    render(<IngredientTagsControl ingredient={ingredient()} />);

    fireEvent.click(screen.getByRole('button', { name: 'pick S1E12' }));

    await waitFor(() => expect(applyTag).toHaveBeenCalled());
    expect(screen.queryByText('S1E12')).not.toBeInTheDocument();
  });

  it('follows the list when it republishes the asset with new tags', () => {
    const { rerender } = render(
      <IngredientTagsControl ingredient={ingredient([launch])} />,
    );

    rerender(<IngredientTagsControl ingredient={ingredient([episode])} />);

    expect(screen.queryByText('Launch')).not.toBeInTheDocument();
    expect(screen.getByText('S1E12')).toBeInTheDocument();
  });

  it('offers the active brand’s tags to the picker', () => {
    render(<IngredientTagsControl ingredient={ingredient()} />);

    expect(
      screen.getByRole('button', { name: 'pick Launch' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'pick S1E12' }),
    ).toBeInTheDocument();
  });
});
