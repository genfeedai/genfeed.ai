import { skillAttributes } from '@serializers/attributes/content/content-skill.attributes';
import { ORGANIZATION_MINIMAL_REL } from '@serializers/relationships';

export const skillSerializerConfig = {
  attributes: skillAttributes,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'skill',
};
