import {
  apiKeyAttributes,
  apiKeyFullAttributes,
} from '@serializers/attributes/common';
import { simpleConfig } from '@serializers/builders';

export const apiKeySerializerConfig = simpleConfig('api-key', apiKeyAttributes);

export const apiKeyFullSerializerConfig = simpleConfig(
  'api-key-full',
  apiKeyFullAttributes,
);
