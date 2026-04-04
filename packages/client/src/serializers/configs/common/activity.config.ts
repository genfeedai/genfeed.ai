import {
  activityAttributes,
  activityBulkPatchAttributes,
} from '../../attributes/common/activity.attributes';
import { simpleConfig } from '../../builders';

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
