import { buildSerializer } from '@serializers/builders';
import { mediaReadinessDiagnosticSerializerConfig } from '@serializers/configs';

export const { MediaReadinessDiagnosticSerializer } = buildSerializer(
  'server',
  mediaReadinessDiagnosticSerializerConfig,
);
