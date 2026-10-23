import type {
  WorkflowTemplateCatalogItem,
  WorkflowTemplatesPageAction,
  WorkflowTemplatesPageState,
} from '@genfeedai/props/workflows/workflow-templates-page.props';
import type {
  FeaturedWorkflow,
  SystemWorkflowCatalogEntry,
  WorkflowTemplate,
} from '@/features/workflows/services/workflow-api';

export type CatalogItem =
  WorkflowTemplateCatalogItem<SystemWorkflowCatalogEntry>;
export type PageState = WorkflowTemplatesPageState<
  WorkflowTemplate,
  SystemWorkflowCatalogEntry,
  FeaturedWorkflow
>;
export type PageAction = WorkflowTemplatesPageAction<
  WorkflowTemplate,
  SystemWorkflowCatalogEntry,
  FeaturedWorkflow
>;
