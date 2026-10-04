import { TagBulkAction, TagScope } from '@genfeedai/contracts';
import { LIBRARY_BULK_TAG_LIMIT } from '@genfeedai/contracts/constants';
import type { IIngredient, ITag } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SelectionTagAction from './SelectionTagAction';

const { applyTag, createTag, notifications } = vi.hoisted(() => ({
  applyTag: vi.fn(),
  createTag: vi.fn(),
  notifications: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ brandId: 'brand-1' }),
}));

vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: { getInstance: () => notifications },
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: { error: vi.fn() },
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

vi.mock('@ui/tags/library-tag-picker/use-library-tags', () => ({
  useLibraryTags: () => ({
    createTag,
    isLoading: false,
    refresh: vi.fn(),
    tags: [launch, episode],
  }),
}));

vi.mock('@ui/tags/library-tag-picker/use-library-tag-writes', () => ({
  useLibraryTagWrites: () => ({ applyTag, isWriting: false }),
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

describe('SelectionTagAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    applyTag.mockResolvedValue({
      changedIds: [],
      result: { changed: 0, failed: 0, skipped: 0 },
    });
  });

  it('adds a tag to every selected asset in one action', () => {
    render(<SelectionTagAction selectedIngredients={assets(3)} />);

    fireEvent.click(screen.getByRole('button', { name: 'pick Launch' }));

    expect(applyTag).toHaveBeenCalledTimes(1);
    expect(applyTag).toHaveBeenCalledWith(TagBulkAction.ADD, launch, [
      'asset-0',
      'asset-1',
      'asset-2',
    ]);
  });

  it('marks a tag every selected asset carries, and removes it from all of them', () => {
    render(
      <SelectionTagAction
        selectedIngredients={assets(2, { 0: [launch], 1: [launch] })}
      />,
    );

    expect(screen.getByRole('button', { name: 'pick Launch' })).toHaveAttribute(
      'data-state',
      'all',
    );

    fireEvent.click(screen.getByRole('button', { name: 'pick Launch' }));

    expect(applyTag).toHaveBeenCalledWith(TagBulkAction.REMOVE, launch, [
      'asset-0',
      'asset-1',
    ]);
  });

  it('marks a tag on only some assets, and adds it to the rest when picked', () => {
    render(
      <SelectionTagAction selectedIngredients={assets(3, { 0: [launch] })} />,
    );

    expect(screen.getByRole('button', { name: 'pick Launch' })).toHaveAttribute(
      'data-state',
      'some',
    );
    expect(screen.getByRole('button', { name: 'pick S1E12' })).toHaveAttribute(
      'data-state',
      'none',
    );

    fireEvent.click(screen.getByRole('button', { name: 'pick Launch' }));

    expect(applyTag).toHaveBeenCalledWith(
      TagBulkAction.ADD,
      launch,
      expect.arrayContaining(['asset-0', 'asset-1', 'asset-2']),
    );
  });

  it('creates a tag and applies it to the whole selection', async () => {
    const created = { ...launch, id: 'tag-spring', label: 'Spring drop' };
    createTag.mockResolvedValue(created);
    render(<SelectionTagAction selectedIngredients={assets(2)} />);

    fireEvent.click(screen.getByRole('button', { name: 'create tag' }));

    await waitFor(() =>
      expect(applyTag).toHaveBeenCalledWith(TagBulkAction.ADD, created, [
        'asset-0',
        'asset-1',
      ]),
    );
  });

  it('reports a tag it could not create instead of tagging anything', async () => {
    createTag.mockRejectedValue(new Error('boom'));
    render(<SelectionTagAction selectedIngredients={assets(2)} />);

    fireEvent.click(screen.getByRole('button', { name: 'create tag' }));

    await waitFor(() =>
      expect(notifications.error).toHaveBeenCalledWith(
        'The tag could not be created.',
      ),
    );
    expect(applyTag).not.toHaveBeenCalled();
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
