import { brandedGenerationReceiptRevisionAttributes } from '@serializers/attributes/content/branded-generation-receipt-revision.attributes';
import { simpleConfig } from '@serializers/builders';
export const brandedGenerationReceiptRevisionSerializerConfig = simpleConfig(
  'branded-generation-receipt-revision',
  brandedGenerationReceiptRevisionAttributes,
);
