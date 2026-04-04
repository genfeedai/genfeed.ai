import { createEntityAttributes } from '@genfeedai/helpers';

/**
 * Common base attributes shared by element types like lens, lighting, camera-movement
 */
export const commonElementBaseAttributes = createEntityAttributes([
  'user',
  'organization',
  'key',
  'label',
  'description',
  'category',
  'isActive',
  'isDefault',
]);

/**
 * Common base attributes for simpler elements like camera, scene, mood
 */
export const simpleElementAttributes = createEntityAttributes([
  'label',
  'description',
  'key',
  'category',
]);
