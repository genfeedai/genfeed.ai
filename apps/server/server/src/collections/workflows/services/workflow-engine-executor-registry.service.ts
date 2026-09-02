import type { WorkflowEngine } from '@genfeedai/workflows/engine';
import { Injectable } from '@nestjs/common';
import { WorkflowAutomationExecutorRegistrarService } from '@server/collections/workflows/services/workflow-automation-executor-registrar.service';
import { WorkflowContentExecutorRegistrarService } from '@server/collections/workflows/services/workflow-content-executor-registrar.service';
import { WorkflowCoreExecutorRegistrarService } from '@server/collections/workflows/services/workflow-core-executor-registrar.service';
import { WorkflowMediaGenerationExecutorRegistrarService } from '@server/collections/workflows/services/workflow-media-generation-executor-registrar.service';
import { WorkflowMediaProcessingExecutorRegistrarService } from '@server/collections/workflows/services/workflow-media-processing-executor-registrar.service';
import { WorkflowSocialExecutorRegistrarService } from '@server/collections/workflows/services/workflow-social-executor-registrar.service';
import { WorkflowTrendPublishExecutorRegistrarService } from '@server/collections/workflows/services/workflow-trend-publish-executor-registrar.service';

@Injectable()
export class WorkflowEngineExecutorRegistryService {
  constructor(
    private readonly core: WorkflowCoreExecutorRegistrarService,
    private readonly social: WorkflowSocialExecutorRegistrarService,
    private readonly mediaProcessing: WorkflowMediaProcessingExecutorRegistrarService,
    private readonly mediaGeneration: WorkflowMediaGenerationExecutorRegistrarService,
    private readonly content: WorkflowContentExecutorRegistrarService,
    private readonly automation: WorkflowAutomationExecutorRegistrarService,
    private readonly trendPublish: WorkflowTrendPublishExecutorRegistrarService,
  ) {}

  register(engine: WorkflowEngine): void {
    this.core.register(engine);
    this.social.register(engine);
    this.mediaProcessing.register(engine);
    this.mediaGeneration.register(engine);
    this.content.register(engine);
    this.automation.register(engine);
    this.trendPublish.register(engine);
  }
}
