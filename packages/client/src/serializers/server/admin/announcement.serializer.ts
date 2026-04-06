import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { announcementSerializerConfig } from '../../configs';

export const AnnouncementSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  announcementSerializerConfig,
);
