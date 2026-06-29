import type {
  WorkflowResource,
  WorkflowTemplateResource,
} from '@mcp/shared/interfaces/api-response.interface';
import type {
  WorkflowCreateParams,
  WorkflowExecuteParams,
  WorkflowExecutionResult,
  WorkflowListParams,
  WorkflowResponse,
  WorkflowTemplate,
} from '@mcp/shared/interfaces/workflow.interface';
import type { BaseApiClient } from './base-api-client';
import { CONTENT_STATUS } from './client.types';

/** Workflow authoring, execution, and template discovery. */
export class WorkflowClient {
  constructor(private readonly base: BaseApiClient) {}

  createWorkflow(params: WorkflowCreateParams): Promise<WorkflowResponse> {
    this.base.logger.debug('Creating workflow', { params });

    return this.base.request(
      'creating workflow',
      async (http) => {
        const response = await http.post('/workflows', {
          data: {
            attributes: {
              description: params.description,
              name: params.name,
              schedule: params.schedule,
              steps: params.steps,
              templateId: params.templateId,
            },
            type: 'workflows',
          },
        });

        const workflow = response.data?.data;
        return {
          createdAt:
            workflow?.attributes?.createdAt || new Date().toISOString(),
          description: workflow?.attributes?.description || params.description,
          id: workflow?.id || workflow?.attributes?.id,
          lastRunAt: workflow?.attributes?.lastRunAt,
          name: workflow?.attributes?.name || params.name,
          nextRunAt: workflow?.attributes?.nextRunAt,
          status: workflow?.attributes?.status || CONTENT_STATUS.DRAFT,
          steps: workflow?.attributes?.steps || params.steps || [],
          updatedAt: workflow?.attributes?.updatedAt,
        };
      },
      this.base.failWithDetail('Failed to create workflow'),
    );
  }

  executeWorkflow(
    params: WorkflowExecuteParams,
  ): Promise<WorkflowExecutionResult> {
    this.base.logger.debug('Executing workflow', { params });

    return this.base.request(
      'executing workflow',
      async (http) => {
        const response = await http.post('/workflow-executions', {
          inputValues: params.variables,
          workflow: params.workflowId,
        });

        const execution = response.data?.data;
        return {
          completedAt: execution?.attributes?.completedAt,
          error: execution?.attributes?.error,
          executionId: execution?.id || execution?.attributes?.id,
          results: execution?.attributes?.results,
          startedAt:
            execution?.attributes?.startedAt || new Date().toISOString(),
          status: execution?.attributes?.status || CONTENT_STATUS.STARTED,
          workflowId: params.workflowId,
        };
      },
      this.base.failWithDetail('Failed to execute workflow'),
    );
  }

  getWorkflowStatus(workflowId: string): Promise<WorkflowResponse> {
    this.base.logger.debug(`Getting workflow status for ID: ${workflowId}`);

    return this.base.request(
      'getting workflow status',
      async (http) => {
        const response = await http.get(`/workflows/${workflowId}`);
        const workflow = response.data?.data;

        return {
          createdAt: workflow?.attributes?.createdAt,
          currentStepIndex: workflow?.attributes?.currentStepIndex,
          description: workflow?.attributes?.description,
          id: workflow?.id,
          lastRunAt: workflow?.attributes?.lastRunAt,
          name: workflow?.attributes?.name,
          nextRunAt: workflow?.attributes?.nextRunAt,
          status: workflow?.attributes?.status || CONTENT_STATUS.DRAFT,
          steps: workflow?.attributes?.steps || [],
          updatedAt: workflow?.attributes?.updatedAt,
        };
      },
      this.base.failWith('Failed to get workflow status'),
    );
  }

  listWorkflows(params: WorkflowListParams = {}): Promise<WorkflowResponse[]> {
    this.base.logger.debug('Listing workflows', { params });

    return this.base.request(
      'listing workflows',
      async (http) => {
        const queryParams: Record<string, string | number> = {
          'page[limit]': params.limit || 10,
          'page[offset]': params.offset || 0,
        };

        if (params.status) {
          queryParams['filter[status]'] = params.status;
        }

        const response = await http.get('/workflows', {
          params: queryParams,
        });

        return (
          response.data?.data?.map((workflow: WorkflowResource) => ({
            createdAt: workflow.attributes?.createdAt,
            currentStepIndex: workflow.attributes?.currentStepIndex,
            description: workflow.attributes?.description,
            id: workflow.id,
            lastRunAt: workflow.attributes?.lastRunAt,
            name: workflow.attributes?.name,
            nextRunAt: workflow.attributes?.nextRunAt,
            status: workflow.attributes?.status || CONTENT_STATUS.DRAFT,
            steps: workflow.attributes?.steps || [],
            updatedAt: workflow.attributes?.updatedAt,
          })) || []
        );
      },
      this.base.failWith('Failed to list workflows'),
    );
  }

  listWorkflowTemplates(): Promise<WorkflowTemplate[]> {
    this.base.logger.debug('Listing workflow templates');

    return this.base.request(
      'listing workflow templates',
      async (http) => {
        const response = await http.get('/workflows/templates');

        return (
          response.data?.data?.map((template: WorkflowTemplateResource) => ({
            category: template.attributes?.category || 'general',
            creditsRequired: template.attributes?.creditsRequired,
            description:
              template.attributes?.description || 'No description available',
            estimatedDuration: template.attributes?.estimatedDuration,
            id: template.id,
            name: template.attributes?.name,
            steps: template.attributes?.steps || [],
          })) || []
        );
      },
      this.base.failWith('Failed to list workflow templates'),
    );
  }
}
