import { threadMessageAttributes } from '../../attributes/threads/thread-message.attributes';
import {
  BRAND_REL,
  ORGANIZATION_MINIMAL_REL,
} from '../../relationships';

export const threadMessageSerializerConfig = {
  attributes: threadMessageAttributes,
  brand: BRAND_REL,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'thread-message',
};
