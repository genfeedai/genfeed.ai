import {
  activityAttributes,
  activityBulkPatchAttributes,
} from '@serializers/attributes/common/activity.attributes';
import { simpleConfig } from '@serializers/builders';

export const activitySerializerConfig = {
  attributes: activityAttributes,
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
