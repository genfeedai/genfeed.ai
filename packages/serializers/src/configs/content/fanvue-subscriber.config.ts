import { fanvueSubscriberAttributes } from '@serializers/attributes/content/fanvue-subscriber.attributes';
import { ORGANIZATION_MINIMAL_REL, USER_REL } from '@serializers/relationships';

export const fanvueSubscriberSerializerConfig = {
  attributes: fanvueSubscriberAttributes,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'fanvue-subscriber',
  user: USER_REL,
};
