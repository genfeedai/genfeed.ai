import { brandedGenerationReceiptAttributes } from '@serializers/attributes/content/branded-generation-receipt.attributes';
import { simpleConfig } from '@serializers/builders';
export const brandedGenerationReceiptSerializerConfig = simpleConfig(
  'branded-generation-receipt',
  brandedGenerationReceiptAttributes,
);
