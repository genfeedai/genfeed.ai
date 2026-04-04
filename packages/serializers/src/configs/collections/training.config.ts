import { trainingAttributes } from '@serializers/attributes/collections/training.attributes';
import { simpleConfig } from '@serializers/builders';

export const trainingSerializerConfig = simpleConfig(
  'training',
  trainingAttributes,
);
