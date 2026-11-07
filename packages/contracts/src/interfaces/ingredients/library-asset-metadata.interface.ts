/** A saved label or description edit the Library list and inspector share. */
export interface ILibraryAssetMetadataChange {
  description?: string;
  ingredientId: string;
  label?: string;
}

/** Ask the inspector to start renaming one asset. */
export interface ILibraryAssetRenameRequest {
  ingredientId: string;
}
