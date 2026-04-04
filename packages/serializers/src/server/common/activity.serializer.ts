import { buildSerializer } from '@serializers/builders';
import {
  activityBulkPatchSerializerConfig,
  activitySerializerConfig,
} from '@serializers/configs';

export const { ActivitySerializer } = buildSerializer(
  'server',
  activitySerializerConfig,
);

export const { ActivityBulkPatchSerializer } = buildSerializer(
  'server',
  activityBulkPatchSerializerConfig,
);
