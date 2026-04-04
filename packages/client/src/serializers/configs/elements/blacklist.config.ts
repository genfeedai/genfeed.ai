import { elementBlacklistAttributes } from '../../attributes/elements/blacklist.attributes';
import { simpleConfig } from '../../builders';

export const elementBlacklistSerializerConfig = simpleConfig(
  'element-blacklist',
  elementBlacklistAttributes,
);
