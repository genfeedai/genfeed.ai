import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { newsletterSerializerConfig } from '../../configs';

export const NewsletterSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  newsletterSerializerConfig,
);
