import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import {
  apiKeyFullSerializerConfig,
  apiKeySerializerConfig,
} from '../../configs';

/** Excludes sensitive data */
export const ApiKeySerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  apiKeySerializerConfig,
);

/** Includes sensitive data */
export const ApiKeyFullSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  apiKeyFullSerializerConfig,
);
