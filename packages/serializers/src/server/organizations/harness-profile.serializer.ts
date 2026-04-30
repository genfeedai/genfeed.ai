import { buildSerializer } from '@serializers/builders';
import { harnessProfileSerializerConfig } from '@serializers/configs';

export const { HarnessProfileSerializer } = buildSerializer(
  'server',
  harnessProfileSerializerConfig,
);
