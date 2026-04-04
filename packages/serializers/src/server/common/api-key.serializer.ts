import { buildSerializer } from '@serializers/builders';
import {
  apiKeyFullSerializerConfig,
  apiKeySerializerConfig,
} from '@serializers/configs';

/** Excludes sensitive data */
export const { ApiKeySerializer } = buildSerializer(
  'server',
  apiKeySerializerConfig,
);

/** Includes sensitive data */
export const { ApiKeyFullSerializer } = buildSerializer(
  'server',
  apiKeyFullSerializerConfig,
);
