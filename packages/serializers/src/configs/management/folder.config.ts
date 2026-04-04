import { folderAttributes } from '@serializers/attributes/management/folder.attributes';
import { BRAND_REL } from '@serializers/relationships';

export const folderSerializerConfig = {
  attributes: folderAttributes,
  brand: BRAND_REL,
  type: 'folder',
};
