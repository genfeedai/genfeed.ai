import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { trackedLinkSerializerConfig } from '../../configs';

export const TrackedLinkSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  trackedLinkSerializerConfig,
);
