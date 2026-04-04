import { buildSerializer } from '@serializers/builders';
import { trackedLinkSerializerConfig } from '@serializers/configs';

export const { TrackedLinkSerializer } = buildSerializer(
  'server',
  trackedLinkSerializerConfig,
);
