import { contextBaseAttributes } from '../../attributes/content/context-base.attributes';
import { ORGANIZATION_MINIMAL_REL } from '../../relationships';

export const contextBaseSerializerConfig = {
  attributes: contextBaseAttributes,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'context-base',
};
