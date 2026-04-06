import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { evaluationSerializerConfig } from '../../configs';

export const EvaluationSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  evaluationSerializerConfig,
);
