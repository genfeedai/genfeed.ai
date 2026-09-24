import {
  AD_BULK_UPLOAD_CHILD_WORKFLOWS,
  buildAdBulkUploadWorkflowDefinition,
} from '@api/collections/workflows/services/ad-bulk-upload-workflow.service';
import { AGENT_RUNTIME_WORKFLOW_DEFINITIONS } from '@api/collections/workflows/services/agent-runtime-workflow-definitions';
import {
  AUTOMATION_CHILD_WORKFLOWS,
  AUTOMATION_PARENT_WORKFLOWS,
} from '@api/collections/workflows/services/automation-workflow-definitions';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { AD_SYNC_CHILD_WORKFLOWS } from '@api/collections/workflows/templates/ad-automation-workflows.template';
import {
  ANALYTICS_COLLECTION_CHILD_WORKFLOWS,
  ANALYTICS_GENERIC_CHILD_WORKFLOWS,
} from '@api/collections/workflows/templates/analytics-sync-workflows.template';
import { CONTENT_LOOP_AUTOPILOT_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/content-loop-autopilot-workflows.template';
import type { WorkflowTemplate } from '@api/collections/workflows/templates/workflow-templates';
import { buildCampaignDispatchWorkflowDefinition } from '@api/services/campaign/campaign-dispatch-workflow-definition';
import { Injectable, type OnModuleInit } from '@nestjs/common';

@Injectable()
export class SystemWorkflowDefinitionRegistrarService implements OnModuleInit {
  constructor(private readonly runner: SystemWorkflowRunnerService) {}

  onModuleInit(): void {
    const templates: Array<WorkflowTemplate & { schedule: string }> = [
      ...CONTENT_LOOP_AUTOPILOT_WORKFLOW_TEMPLATES,
    ];
    const definitions = [
      ...templates.map((template) => {
        const nodes = template.nodes;
        if (!nodes?.length)
          throw new Error(`System template ${template.id} has no graph nodes`);
        return {
          canonicalId: template.id,
          definition: {
            nodes,
            edges: template.edges ?? [],
            inputVariables: (template.inputVariables ?? []).map((variable) => ({
              ...variable,
              required: variable.required ?? false,
            })),
          },
          description: template.description,
          label: template.name,
          resultNodeId: nodes[nodes.length - 1].id,
          schedule: template.schedule,
          version: template.version ?? 1,
        };
      }),
      ...AGENT_RUNTIME_WORKFLOW_DEFINITIONS,
      ...AD_SYNC_CHILD_WORKFLOWS,
      buildAdBulkUploadWorkflowDefinition(),
      ...AD_BULK_UPLOAD_CHILD_WORKFLOWS,
      ...ANALYTICS_COLLECTION_CHILD_WORKFLOWS,
      ...ANALYTICS_GENERIC_CHILD_WORKFLOWS,
      ...AUTOMATION_CHILD_WORKFLOWS,
      ...AUTOMATION_PARENT_WORKFLOWS,
      buildCampaignDispatchWorkflowDefinition(),
    ];
    for (const definition of definitions) {
      this.runner.registerWorkflow(definition);
    }
  }
}
