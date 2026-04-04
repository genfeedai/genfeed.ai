import { threadMessageAttributes } from '@serializers/attributes/threads/thread-message.attributes';
import {
  BRAND_REL,
  ORGANIZATION_MINIMAL_REL,
} from '@serializers/relationships';

export const threadMessageSerializerConfig = {
  attributes: threadMessageAttributes,
  brand: BRAND_REL,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'thread-message',
};
