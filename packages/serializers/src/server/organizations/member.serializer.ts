import { buildSerializer } from '@serializers/builders';
import { memberSerializerConfig } from '@serializers/configs';

export const { MemberSerializer } = buildSerializer(
  'server',
  memberSerializerConfig,
);
