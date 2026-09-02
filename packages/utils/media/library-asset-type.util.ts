import { IngredientCategory } from '@genfeedai/contracts';

/**
 * Operator-facing asset types on the Library type axis.
 *
 * One type covers every category that reads as the same thing: an edited video
 * is still a video. Labels are singular title-case so the filter and the table
 * pill can never drift into "Videos" vs "VIDEO".
 */
export type LibraryAssetTypeId =
  | 'image'
  | 'video'
  | 'gif'
  | 'avatar'
  | 'audio'
  | 'voice'
  | 'text';

export type LibraryAssetBadgeVariant = LibraryAssetTypeId;

export interface LibraryAssetType {
  readonly badgeVariant: LibraryAssetBadgeVariant;
  readonly categories: readonly IngredientCategory[];
  readonly id: LibraryAssetTypeId;
  readonly label: string;
}

export const LIBRARY_ASSET_TYPES: readonly LibraryAssetType[] = [
  {
    badgeVariant: 'image',
    categories: [IngredientCategory.IMAGE, IngredientCategory.IMAGE_EDIT],
    id: 'image',
    label: 'Image',
  },
  {
    badgeVariant: 'video',
    categories: [IngredientCategory.VIDEO, IngredientCategory.VIDEO_EDIT],
    id: 'video',
    label: 'Video',
  },
  {
    badgeVariant: 'gif',
    categories: [IngredientCategory.GIF],
    id: 'gif',
    label: 'GIF',
  },
  {
    badgeVariant: 'avatar',
    categories: [IngredientCategory.AVATAR],
    id: 'avatar',
    label: 'Avatar',
  },
  {
    badgeVariant: 'audio',
    categories: [IngredientCategory.MUSIC, IngredientCategory.AUDIO],
    id: 'audio',
    label: 'Audio',
  },
  {
    badgeVariant: 'voice',
    categories: [IngredientCategory.VOICE],
    id: 'voice',
    label: 'Voice',
  },
  {
    badgeVariant: 'text',
    categories: [IngredientCategory.TEXT],
    id: 'text',
    label: 'Text',
  },
];

export function getLibraryAssetType(
  category: IngredientCategory | string | null | undefined,
): LibraryAssetType | undefined {
  if (!category) {
    return undefined;
  }

  return LIBRARY_ASSET_TYPES.find((type) =>
    type.categories.includes(category as IngredientCategory),
  );
}

export function getLibraryAssetTypeLabel(
  category: IngredientCategory | string | null | undefined,
): string | undefined {
  return getLibraryAssetType(category)?.label;
}

export function categoriesFromAssetTypeIds(
  ids: readonly string[],
): IngredientCategory[] {
  const selected = new Set(ids);

  return LIBRARY_ASSET_TYPES.filter((type) => selected.has(type.id)).flatMap(
    (type) => [...type.categories],
  );
}

export function selectedAssetTypeIds(
  categories: readonly IngredientCategory[],
): LibraryAssetTypeId[] {
  return LIBRARY_ASSET_TYPES.filter((type) =>
    type.categories.every((category) => categories.includes(category)),
  ).map((type) => type.id);
}
