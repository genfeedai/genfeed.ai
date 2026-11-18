import { waitlistEntryAttributes } from '@serializers/attributes/admin/waitlist-entry.attributes';
import { simpleConfig } from '@serializers/builders';

export const waitlistEntrySerializerConfig = simpleConfig(
  'waitlist-entry',
  waitlistEntryAttributes,
);
