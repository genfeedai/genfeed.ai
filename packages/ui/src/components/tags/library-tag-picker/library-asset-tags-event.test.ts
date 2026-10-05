import { TagBulkAction } from '@genfeedai/contracts';
import { LIBRARY_ASSET_TAGS_EVENT } from '@genfeedai/contracts/constants';
import type {
  IIngredient,
  ILibraryAssetTagsChange,
  ITag,
} from '@genfeedai/contracts/interfaces';
import { describe, expect, it, vi } from 'vitest';
import {
  applyLibraryAssetTagsChange,
  applyLibraryTagUpdate,
  dispatchLibraryAssetTagsChange,
} from './library-asset-tags-event';

const tag = { id: 'tag-1', label: 'S1E12' } as ITag;
const other = { id: 'tag-2', label: 'Launch' } as ITag;

function asset(id: string, tags?: ITag[]): IIngredient {
  return { id, tags } as IIngredient;
}

describe('applyLibraryAssetTagsChange', () => {
  it('adds the tag to the changed assets only', () => {
    const untouched = asset('b');
    const result = applyLibraryAssetTagsChange(
      [asset('a', [other]), untouched],
      { action: TagBulkAction.ADD, ingredientIds: ['a'], tag },
    );

    expect(result[0]?.tags).toEqual([other, tag]);
    expect(result[1]).toBe(untouched);
  });

  it('starts a tag list on an asset that had none', () => {
    const [result] = applyLibraryAssetTagsChange([asset('a')], {
      action: TagBulkAction.ADD,
      ingredientIds: ['a'],
      tag,
    });

    expect(result?.tags).toEqual([tag]);
  });

  it('never adds the same tag twice', () => {
    const [result] = applyLibraryAssetTagsChange([asset('a', [tag])], {
      action: TagBulkAction.ADD,
      ingredientIds: ['a'],
      tag,
    });

    expect(result?.tags).toEqual([tag]);
  });

  it('removes the tag from the changed assets and keeps the others', () => {
    const [result] = applyLibraryAssetTagsChange([asset('a', [tag, other])], {
      action: TagBulkAction.REMOVE,
      ingredientIds: ['a'],
      tag,
    });

    expect(result?.tags).toEqual([other]);
  });

  it('keeps the identity of every row the change does not name', () => {
    const rows = [asset('a'), asset('b')];

    const result = applyLibraryAssetTagsChange(rows, {
      action: TagBulkAction.ADD,
      ingredientIds: [],
      tag,
    });

    expect(result[0]).toBe(rows[0]);
    expect(result[1]).toBe(rows[1]);
  });
});

/** Like the list's `Ingredient` model: the media URL is a prototype getter. */
class ModelAsset {
  id: string;
  tags?: ITag[];
  private readonly url = 'https://cdn.genfeed.ai/a.jpg';

  constructor(id: string, tags?: ITag[]) {
    this.id = id;
    this.tags = tags;
  }

  get ingredientUrl(): string {
    return this.url;
  }
}

describe('applyLibraryAssetTagsChange with model instances', () => {
  it('keeps the getters the previews read, so a tag change never blanks them', () => {
    const row = new ModelAsset('a') as unknown as IIngredient;

    const [result] = applyLibraryAssetTagsChange([row], {
      action: TagBulkAction.ADD,
      ingredientIds: ['a'],
      tag,
    });

    expect(result).not.toBe(row);
    expect(result?.tags).toEqual([tag]);
    expect(result?.ingredientUrl).toBe('https://cdn.genfeed.ai/a.jpg');
  });
});

describe('applyLibraryTagUpdate', () => {
  const recolored = { ...tag, backgroundColor: '#2563EB' } as ITag;

  it('swaps the updated tag into every asset that carries it', () => {
    const untouched = asset('b', [other]);
    const result = applyLibraryTagUpdate(
      [asset('a', [other, tag]), untouched],
      recolored,
    );

    expect(result[0]?.tags).toEqual([other, recolored]);
    expect(result[1]).toBe(untouched);
  });

  it('keeps the getters of the rows it rewrites', () => {
    const [result] = applyLibraryTagUpdate(
      [new ModelAsset('a', [tag]) as unknown as IIngredient],
      recolored,
    );

    expect(result?.tags).toEqual([recolored]);
    expect(result?.ingredientUrl).toBe('https://cdn.genfeed.ai/a.jpg');
  });
});

describe('dispatchLibraryAssetTagsChange', () => {
  it('publishes the change on window', () => {
    const listener = vi.fn();
    window.addEventListener(LIBRARY_ASSET_TAGS_EVENT, listener);
    const change: ILibraryAssetTagsChange = {
      action: TagBulkAction.ADD,
      ingredientIds: ['a'],
      tag,
    };

    dispatchLibraryAssetTagsChange(change);

    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual(change);
    window.removeEventListener(LIBRARY_ASSET_TAGS_EVENT, listener);
  });

  it('publishes nothing when no asset changed', () => {
    const listener = vi.fn();
    window.addEventListener(LIBRARY_ASSET_TAGS_EVENT, listener);

    dispatchLibraryAssetTagsChange({
      action: TagBulkAction.REMOVE,
      ingredientIds: [],
      tag,
    });

    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener(LIBRARY_ASSET_TAGS_EVENT, listener);
  });
});
