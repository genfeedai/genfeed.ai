import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { evaluationSerializerConfig } from '../../configs';

export const EvaluationSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  evaluationSerializerConfig,
);
