import { announcementAttributes } from '../../attributes/admin/announcement.attributes';
import { simpleConfig } from '../../builders';

export const announcementSerializerConfig = simpleConfig(
  'announcement',
  announcementAttributes,
);
