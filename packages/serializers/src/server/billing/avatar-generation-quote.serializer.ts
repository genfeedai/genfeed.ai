import { buildSerializer } from '@serializers/builders';
import { avatarGenerationQuoteSerializerConfig } from '@serializers/configs/billing/avatar-generation-quote.config';

const avatarGenerationQuoteSerializers = buildSerializer(
  'server',
  avatarGenerationQuoteSerializerConfig,
);

export const { AvatarGenerationQuoteSerializer } =
  avatarGenerationQuoteSerializers;
