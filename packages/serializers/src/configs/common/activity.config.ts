import {
  activityAttributes,
  activityBulkPatchAttributes,
} from '@serializers/attributes/common/activity.attributes';
import { ingredientAttributes } from '@serializers/attributes/ingredients/ingredient.attributes';
import { metadataAttributes } from '@serializers/attributes/ingredients/metadata.attributes';
import { nestedRel, rel, simpleConfig } from '@serializers/builders';

export const activitySerializerConfig = {
  attributes: activityAttributes,
  ingredient: nestedRel('ingredient', ingredientAttributes, {
    metadata: rel('metadata', metadataAttributes),
  }),
  relationships: {
    entity: {
      attributes: ['category', 'slug', 'status', 'label'],
      type: 'entity',
    },
  },
  type: 'activity',
};

export const activityBulkPatchSerializerConfig = simpleConfig(
  'activity-bulk-patch',
  activityBulkPatchAttributes,
);
