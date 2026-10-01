import { crunGenerationQuoteAttributes } from '@serializers/attributes/billing/crun-generation-quote.attributes';
import { simpleConfig } from '@serializers/builders';

export const crunGenerationQuoteSerializerConfig = simpleConfig(
  'crun-generation-quote',
  crunGenerationQuoteAttributes,
);
