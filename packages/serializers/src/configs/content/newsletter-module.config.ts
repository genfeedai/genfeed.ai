import {
  brandSubscriberAttributes,
  newsletterSendAttributes,
  newsletterSettingsAttributes,
} from '@serializers/attributes/content/newsletter-module.attributes';
import { simpleConfig } from '@serializers/builders';

export const brandSubscriberSerializerConfig = simpleConfig(
  'brand-subscriber',
  brandSubscriberAttributes,
);

export const newsletterSendSerializerConfig = simpleConfig(
  'newsletter-send',
  newsletterSendAttributes,
);

export const newsletterSettingsSerializerConfig = simpleConfig(
  'newsletter-settings',
  newsletterSettingsAttributes,
);
