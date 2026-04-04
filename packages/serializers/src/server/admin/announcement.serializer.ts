import { buildSerializer } from '@serializers/builders';
import { announcementSerializerConfig } from '@serializers/configs';

export const { AnnouncementSerializer } = buildSerializer(
  'server',
  announcementSerializerConfig,
);
