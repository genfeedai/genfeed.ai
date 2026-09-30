import { buildSerializer } from '@serializers/builders';
import {
  visualCodeCatalogSerializerConfig,
  visualCodeQuoteSerializerConfig,
  visualProjectSerializerConfig,
} from '@serializers/configs/content/visual-project.config';
export const { VisualProjectSerializer } = buildSerializer(
  'server',
  visualProjectSerializerConfig,
);
export const { VisualCodeCatalogSerializer } = buildSerializer(
  'server',
  visualCodeCatalogSerializerConfig,
);
export const { VisualCodeQuoteSerializer } = buildSerializer(
  'server',
  visualCodeQuoteSerializerConfig,
);
