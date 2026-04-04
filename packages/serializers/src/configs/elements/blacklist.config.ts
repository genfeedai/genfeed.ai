import { elementBlacklistAttributes } from '@serializers/attributes/elements/blacklist.attributes';
import { simpleConfig } from '@serializers/builders';

export const elementBlacklistSerializerConfig = simpleConfig(
  'element-blacklist',
  elementBlacklistAttributes,
);
