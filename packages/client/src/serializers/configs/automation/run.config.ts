import { runAttributes } from '../../attributes/automation/run.attributes';
import { ORGANIZATION_MINIMAL_REL, USER_REL } from '../../relationships';

export const runSerializerConfig = {
  attributes: runAttributes,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'run',
  user: USER_REL,
};
