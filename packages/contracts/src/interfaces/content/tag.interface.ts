import type { TagBulkAction, TagCategory, TagScope } from '../..';
import type { IBaseEntity, IBrand, IOrganization, IUser } from '../index';

export interface ITag extends IBaseEntity {
  user: IUser;
  organization: IOrganization;
  brand: IBrand;

  category: TagCategory;

  label: string;
  description?: string;
  key?: string;

  backgroundColor: string;
  textColor: string;
  isActive?: boolean;

  /** Owner columns the read model exposes so the scope can be derived. */
  brandId?: string | null;
  organizationId?: string | null;

  /** Where the tag is visible (#6011). Present on Library tag lists. */
  scope?: TagScope;
  /** Assets carrying this tag in the requested brand. Library tag lists only. */
  assetCount?: number;
}

/** Result of a bulk tag add or remove (#6011). */
export interface IBulkTagResult {
  /** Assets whose tags actually changed. */
  changed: number;
  /** Assets that already matched, or that the caller cannot edit. */
  skipped: number;
  /** Assets whose write failed. */
  failed: number;
  /** Ids behind `skipped`, so the UI can say which. */
  skippedIds: string[];
  failedIds: string[];
}

/** A tag change the Library list and the inspector share (#6011). */
export interface ILibraryAssetTagsChange {
  action: TagBulkAction;
  /** Assets whose tags actually changed. */
  ingredientIds: string[];
  tag: ITag;
}

/**
 * The fields of a Library tag that changed. Only these are merged into loaded
 * assets, so an edit never replays fields it did not touch.
 */
export interface ILibraryTagUpdate
  extends Partial<Pick<ITag, 'backgroundColor' | 'label' | 'textColor'>> {
  id: string;
}

/** A color a Library tag can take from its picker. */
export interface ITagColorSwatch {
  backgroundColor: string;
  name: string;
  textColor: string;
}
