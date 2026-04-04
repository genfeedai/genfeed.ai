import { orgIntegrationAttributes } from '@serializers/attributes/integrations/org-integration.attributes';
import { ORGANIZATION_MINIMAL_REL } from '@serializers/relationships';

export const orgIntegrationSerializerConfig = {
  attributes: orgIntegrationAttributes,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'org-integration',
};
