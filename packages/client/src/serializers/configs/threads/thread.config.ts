import { threadAttributes } from '../../attributes/threads/thread.attributes';
import { ORGANIZATION_MINIMAL_REL, USER_REL } from '../../relationships';

export const threadSerializerConfig = {
  attributes: threadAttributes,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'thread',
  user: USER_REL,
};
