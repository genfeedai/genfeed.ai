import { buildSerializer } from '@serializers/builders';
import { goalSerializerConfig } from '@serializers/configs';

export const { GoalSerializer } = buildSerializer(
  'server',
  goalSerializerConfig,
);
