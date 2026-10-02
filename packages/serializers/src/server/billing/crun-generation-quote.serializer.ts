import { buildSerializer } from '@serializers/builders';
import { crunGenerationQuoteSerializerConfig } from '@serializers/configs/billing/crun-generation-quote.config';

const crunGenerationQuoteSerializers = buildSerializer(
  'server',
  crunGenerationQuoteSerializerConfig,
);

export const { CrunGenerationQuoteSerializer } = crunGenerationQuoteSerializers;
