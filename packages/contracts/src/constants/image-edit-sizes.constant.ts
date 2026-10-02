export const IMAGE_EDIT_SIZES = [
  'source',
  '1024x1024',
  '1280x896',
  '896x1280',
  '1344x768',
  '768x1344',
  '1536x640',
  '640x1536',
] as const;
export type ImageEditSize = (typeof IMAGE_EDIT_SIZES)[number];
