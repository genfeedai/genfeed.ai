import { buildSerializer } from '@serializers/builders';
import {
  brandSubscriberSerializerConfig,
  newsletterSendSerializerConfig,
  newsletterSettingsSerializerConfig,
} from '@serializers/configs';

export const { BrandSubscriberSerializer } = buildSerializer(
  'server',
  brandSubscriberSerializerConfig,
);

export const { NewsletterSendSerializer } = buildSerializer(
  'server',
  newsletterSendSerializerConfig,
);

export const { NewsletterSettingsSerializer } = buildSerializer(
  'server',
  newsletterSettingsSerializerConfig,
);
