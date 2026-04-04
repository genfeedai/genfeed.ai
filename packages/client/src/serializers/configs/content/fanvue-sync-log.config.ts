import { fanvueSyncLogAttributes } from '../../attributes/content/fanvue-sync-log.attributes';
import { ORGANIZATION_MINIMAL_REL, USER_REL } from '../../relationships';

export const fanvueSyncLogSerializerConfig = {
  attributes: fanvueSyncLogAttributes,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'fanvue-sync-log',
  user: USER_REL,
};
