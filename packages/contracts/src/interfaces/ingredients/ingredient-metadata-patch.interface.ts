import type { IMetadata } from '../automation/metadata.interface';

/**
 * The metadata fields `PATCH /ingredients/:id/metadata` accepts. Media
 * locations, dimensions and prompt relations are server-owned, so a caller
 * cannot send them.
 */
export type IIngredientMetadataPatch = Partial<
  Pick<IMetadata, 'description' | 'label'>
>;
