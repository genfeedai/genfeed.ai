import { evaluationAttributes } from '../../attributes/analytics/evaluation.attributes';
import { simpleConfig } from '../../builders';

export const evaluationSerializerConfig = simpleConfig(
  'evaluation',
  evaluationAttributes,
);
