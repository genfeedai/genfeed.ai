import { buildSerializer } from '@serializers/builders';
import { profileSerializerConfig } from '@serializers/configs';

export const { ProfileSerializer } = buildSerializer(
  'server',
  profileSerializerConfig,
);
