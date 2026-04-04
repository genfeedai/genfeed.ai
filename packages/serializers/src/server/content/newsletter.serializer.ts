import { buildSerializer } from '@serializers/builders';
import { newsletterSerializerConfig } from '@serializers/configs';

export const { NewsletterSerializer } = buildSerializer(
  'server',
  newsletterSerializerConfig,
);
