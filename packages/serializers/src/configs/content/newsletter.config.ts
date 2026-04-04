import { newsletterAttributes } from '@serializers/attributes/content/newsletter.attributes';
import { simpleConfig } from '@serializers/builders';

export const newsletterSerializerConfig = simpleConfig(
  'newsletter',
  newsletterAttributes,
);
