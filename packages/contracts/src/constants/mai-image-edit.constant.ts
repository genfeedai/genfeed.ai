import { MODEL_KEYS } from './model-keys.constant';

/**
 * MAI-Image-2.7 editing on fal (verified 2026-11-24): one to five source
 * images, one output, sized from the first source. It takes no mask, seed,
 * fixed size, quality tier or native resolution, so a request that sets one is
 * refused instead of silently dropped.
 */
export const MAI_IMAGE_EDIT_CONTRACT_VERSION = 'mai-image-edit-2026-11-24';
export const MAI_IMAGE_EDIT_MAX_SOURCES = 5;
export const MAI_IMAGE_EDIT_MODEL_KEYS: readonly string[] = [
  MODEL_KEYS.FAL_MAI_IMAGE_2_7_EDIT,
  MODEL_KEYS.FAL_MAI_IMAGE_2_7_FLASH_EDIT,
];

export function isMaiImageEditModel(model: string): boolean {
  return MAI_IMAGE_EDIT_MODEL_KEYS.includes(model);
}
