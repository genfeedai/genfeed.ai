import { contentSkillAttributes } from '../../attributes/content/content-skill.attributes';
import { ORGANIZATION_MINIMAL_REL } from '../../relationships';

export const contentSkillSerializerConfig = {
  attributes: contentSkillAttributes,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'content-skill',
};
