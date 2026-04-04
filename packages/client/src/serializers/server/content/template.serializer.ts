import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { templateSerializerConfig } from '../../configs';

export const TemplateSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  templateSerializerConfig,
);
