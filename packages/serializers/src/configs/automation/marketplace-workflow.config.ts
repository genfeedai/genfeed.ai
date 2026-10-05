import { marketplaceWorkflowAttributes } from '@serializers/attributes/automation/marketplace-workflow.attributes';
import { simpleConfig } from '@serializers/builders';

export const marketplaceWorkflowSerializerConfig = simpleConfig(
  'workflow',
  marketplaceWorkflowAttributes,
);
