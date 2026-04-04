import { contextEntryAttributes } from '../../attributes/content/context-entry.attributes';
import { ORGANIZATION_MINIMAL_REL } from '../../relationships';

export const contextEntrySerializerConfig = {
  attributes: contextEntryAttributes,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'context-entry',
};
