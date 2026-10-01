import { ModelCategory } from '@genfeedai/contracts';

const IMAGE_FAL_SCHEMA_FAMILIES = new Set([
  'image-edit-multi-v1',
  'image-edit-single-v1',
  'image-text-v1',
]);
const VIDEO_FAL_SCHEMA_FAMILIES = new Set(['video-image-v1', 'video-text-v1']);

export function isFalSchemaFamilyCompatible(
  category: string,
  schemaFamily: string,
): boolean {
  if (IMAGE_FAL_SCHEMA_FAMILIES.has(schemaFamily)) {
    return [ModelCategory.IMAGE, ModelCategory.IMAGE_EDIT].includes(
      category as ModelCategory,
    );
  }
  if (VIDEO_FAL_SCHEMA_FAMILIES.has(schemaFamily)) {
    return [ModelCategory.VIDEO, ModelCategory.VIDEO_EDIT].includes(
      category as ModelCategory,
    );
  }
  return false;
}

export function isCrunSchemaFamilyCompatible(
  category: string,
  schemaFamily: string,
): boolean {
  return category === ModelCategory.IMAGE && schemaFamily === 'crun-image-v1';
}
