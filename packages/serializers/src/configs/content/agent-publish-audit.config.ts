import { agentPublishAuditAttributes } from '@serializers/attributes/content/agent-publish-audit.attributes';
import {
  BRAND_MINIMAL_REL,
  ORGANIZATION_MINIMAL_REL,
  USER_REL,
} from '@serializers/relationships';

export const agentPublishAuditSerializerConfig = {
  attributes: agentPublishAuditAttributes,
  brand: BRAND_MINIMAL_REL,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'agent-publish-audit',
  user: USER_REL,
};
