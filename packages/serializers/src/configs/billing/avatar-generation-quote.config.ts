import { avatarGenerationQuoteAttributes } from '@serializers/attributes/billing/avatar-generation-quote.attributes';
import { simpleConfig } from '@serializers/builders';

export const avatarGenerationQuoteSerializerConfig = simpleConfig(
  'avatar-generation-quote',
  avatarGenerationQuoteAttributes,
);
