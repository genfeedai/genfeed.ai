import { folderAttributes } from '../../attributes/management/folder.attributes';
import { BRAND_REL } from '../../relationships';

export const folderSerializerConfig = {
  attributes: folderAttributes,
  brand: BRAND_REL,
  type: 'folder',
};
