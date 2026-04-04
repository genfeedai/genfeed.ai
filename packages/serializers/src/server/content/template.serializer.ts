import { buildSerializer } from '@serializers/builders';
import { templateSerializerConfig } from '@serializers/configs';

export const { TemplateSerializer } = buildSerializer(
  'server',
  templateSerializerConfig,
);
