import { buildSerializer } from '@serializers/builders';
import { marketplaceWorkflowSerializerConfig } from '@serializers/configs/automation/marketplace-workflow.config';

export const { WorkflowSerializer: MarketplaceWorkflowSerializer } =
  buildSerializer('server', marketplaceWorkflowSerializerConfig);
