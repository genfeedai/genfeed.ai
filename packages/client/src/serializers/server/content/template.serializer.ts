import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { templateSerializerConfig } from '../../configs';

export const TemplateSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  templateSerializerConfig,
);
