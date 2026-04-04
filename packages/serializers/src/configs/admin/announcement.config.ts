import { announcementAttributes } from '@serializers/attributes/admin/announcement.attributes';
import { simpleConfig } from '@serializers/builders';

export const announcementSerializerConfig = simpleConfig(
  'announcement',
  announcementAttributes,
);
