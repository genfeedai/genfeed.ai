import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import {
  activityBulkPatchSerializerConfig,
  activitySerializerConfig,
} from '../../configs';

export const ActivitySerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  activitySerializerConfig,
);

export const ActivityBulkPatchSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  activityBulkPatchSerializerConfig,
);
