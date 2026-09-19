import { mediaReadinessDiagnosticAttributes } from '@serializers/attributes/content/media-readiness-diagnostic.attributes';
import { simpleConfig } from '@serializers/builders';

export const mediaReadinessDiagnosticSerializerConfig = simpleConfig(
  'media-readiness-diagnostic',
  mediaReadinessDiagnosticAttributes,
);
