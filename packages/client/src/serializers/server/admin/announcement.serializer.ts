import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { announcementSerializerConfig } from '../../configs';

export const AnnouncementSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  announcementSerializerConfig,
);
