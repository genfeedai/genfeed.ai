import { trainingAttributes } from '../../attributes/collections/training.attributes';
import { simpleConfig } from '../../builders';

export const trainingSerializerConfig = simpleConfig(
  'training',
  trainingAttributes,
);
