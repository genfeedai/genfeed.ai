import {
  apiKeyAttributes,
  apiKeyFullAttributes,
} from '../../attributes/common';
import { simpleConfig } from '../../builders';

export const apiKeySerializerConfig = simpleConfig('api-key', apiKeyAttributes);

export const apiKeyFullSerializerConfig = simpleConfig(
  'api-key-full',
  apiKeyFullAttributes,
);
