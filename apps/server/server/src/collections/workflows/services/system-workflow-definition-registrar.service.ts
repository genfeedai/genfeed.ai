import { Injectable, type OnModuleInit } from '@nestjs/common';
import {
  AD_BULK_UPLOAD_CHILD_WORKFLOWS,
  buildAdBulkUploadWorkflowDefinition,
} from '@server/collections/workflows/services/ad-bulk-upload-workflow.service';
import { AGENT_RUNTIME_WORKFLOW_DEFINITIONS } from '@server/collections/workflows/services/agent-runtime-workflow-definitions';
import {
  AUTOMATION_CHILD_WORKFLOWS,
  AUTOMATION_PARENT_WORKFLOWS,
} from '@server/collections/workflows/services/automation-workflow-definitions';
import { SystemWorkflowRunnerService } from '@server/collections/workflows/system-workflow-runner.service';
import { AD_SYNC_CHILD_WORKFLOWS } from '@server/collections/workflows/templates/ad-automation-workflows.template';
import {
  ANALYTICS_COLLECTION_CHILD_WORKFLOWS,
  ANALYTICS_GENERIC_CHILD_WORKFLOWS,
} from '@server/collections/workflows/templates/analytics-sync-workflows.template';
import { buildCampaignDispatchWorkflowDefinition } from '@server/services/campaign/campaign-dispatch-workflow-definition';

@Injectable()
export class SystemWorkflowDefinitionRegistrarService implements OnModuleInit {
  constructor(private readonly runner: SystemWorkflowRunnerService) {}

  onModuleInit(): void {
    const definitions = [
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
