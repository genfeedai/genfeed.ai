import { evaluationAttributes } from '@serializers/attributes/analytics/evaluation.attributes';
import { simpleConfig } from '@serializers/builders';

export const evaluationSerializerConfig = simpleConfig(
  'evaluation',
  evaluationAttributes,
);
