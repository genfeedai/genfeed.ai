import { buildSerializer } from '@serializers/builders';
import { harnessProfileRevisionSerializerConfig } from '@serializers/configs';

export const { HarnessProfileRevisionSerializer } = buildSerializer(
  'server',
  harnessProfileRevisionSerializerConfig,
);
