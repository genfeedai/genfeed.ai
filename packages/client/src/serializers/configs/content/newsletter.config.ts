import { newsletterAttributes } from '../../attributes/content/newsletter.attributes';
import { simpleConfig } from '../../builders';

export const newsletterSerializerConfig = simpleConfig(
  'newsletter',
  newsletterAttributes,
);
