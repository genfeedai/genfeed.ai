import { buildSerializer } from '@serializers/builders';
import { evaluationSerializerConfig } from '@serializers/configs';

export const { EvaluationSerializer } = buildSerializer(
  'server',
  evaluationSerializerConfig,
);
