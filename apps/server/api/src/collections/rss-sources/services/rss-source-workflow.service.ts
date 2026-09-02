import {
  type RssItemClaim,
  type RssItemRelease,
  type RssItemWorkflowRequest,
  RssSourcesService,
  type RssSourceWorkflowRequest,
} from '@api/collections/rss-sources/services/rss-sources.service';
import {
  buildRssItemWorkflowDefinition,
  buildRssSourceWorkflowDefinition,
  buildRssSweepWorkflowDefinition,
  RSS_SWEEP_ACTION_IDS,
} from '@api/collections/rss-sources/services/rss-sweep-workflow-definition';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { WorkflowExecutionTrigger } from '@genfeedai/contracts';
import { Injectable, type OnModuleInit } from '@nestjs/common';

const SYSTEM_MAINTENANCE_PRINCIPAL_ID = 'genfeed-public-tools';
const RSS_SWEEP_INTERVAL_MS = 15 * 60 * 1000;

@Injectable()
export class RssSourceWorkflowService implements OnModuleInit {
  constructor(
    private readonly rssSources: RssSourcesService,
    private readonly queue: WorkflowExecutionQueueService,
    private readonly runner: SystemWorkflowRunnerService,
  ) {}

  onModuleInit(): void {
    this.runner.registerAction(RSS_SWEEP_ACTION_IDS.DISCOVER_SOURCES, () =>
      this.discoverSources(),
    );
    this.runner.registerAction(RSS_SWEEP_ACTION_IDS.FETCH_ITEMS, ({ input }) =>
      this.rssSources.fetchWorkflowItems(
        input.request as RssSourceWorkflowRequest,
      ),
    );
    this.runner.registerAction(RSS_SWEEP_ACTION_IDS.CLAIM_ITEM, ({ input }) =>
      this.rssSources.claimWorkflowItem(
        input.request as RssItemWorkflowRequest,
      ),
    );
    this.runner.registerAction(
      RSS_SWEEP_ACTION_IDS.CREATE_RELEASE,
      ({ input }) =>
        this.rssSources.createWorkflowRelease(
          this.unwrapBranch<RssItemClaim>(input.claim),
        ),
    );
    this.runner.registerAction(RSS_SWEEP_ACTION_IDS.PUBLISH_ITEM, ({ input }) =>
      this.rssSources.publishWorkflowRelease(
        this.unwrapBranch<RssItemRelease>(input.release),
      ),
    );
    this.runner.registerAction(
      RSS_SWEEP_ACTION_IDS.FINALIZE_ITEM,
      ({ input }) =>
        this.rssSources.finalizeWorkflowItem(
          input.request as RssItemWorkflowRequest,
          this.optionalOutcome(input.outcome),
          input.failure,
        ),
    );
    this.runner.registerAction(
      RSS_SWEEP_ACTION_IDS.FINALIZE_SOURCE,
      ({ input }) =>
        this.rssSources.finalizeWorkflowSource(
          input.request as RssSourceWorkflowRequest,
          input.results,
          input.failure,
        ),
    );
    this.runner.registerWorkflow(buildRssSweepWorkflowDefinition());
    this.runner.registerWorkflow(buildRssSourceWorkflowDefinition());
    this.runner.registerWorkflow(buildRssItemWorkflowDefinition());
  }

  async enqueueSweep(now = new Date()): Promise<string> {
    const definition = buildRssSweepWorkflowDefinition();
    return this.queue.queueSystemWorkflow(
      {
        actionType: definition.canonicalId,
        canonicalId: definition.canonicalId,
        inputValues: { request: { requestedAt: now.toISOString() } },
        organizationId: SYSTEM_MAINTENANCE_PRINCIPAL_ID,
        source: 'rss_autopost_sweep',
        trigger: WorkflowExecutionTrigger.SCHEDULED,
        userId: SYSTEM_MAINTENANCE_PRINCIPAL_ID,
      },
      `rss-sweep-${Math.floor(now.getTime() / RSS_SWEEP_INTERVAL_MS)}`,
      { attempts: 3, replaceTerminalJob: true },
    );
  }

  async enqueueSource(request: RssSourceWorkflowRequest): Promise<string> {
    const definition = buildRssSourceWorkflowDefinition();
    return this.queue.queueSystemWorkflow(
      {
        actionType: definition.canonicalId,
        canonicalId: definition.canonicalId,
        inputValues: { request },
        organizationId: request.organizationId,
        source: 'rss_manual_poll',
        trigger: WorkflowExecutionTrigger.API,
        userId: request.userId,
      },
      `rss-source-${request.sourceId}-${Date.now()}`,
      { attempts: 3, replaceTerminalJob: true },
    );
  }

  private async discoverSources(): Promise<{
    items: RssSourceWorkflowRequest[];
  }> {
    const sources = await this.rssSources.listEnabledForSweep();
    return {
      items: sources.map((source) => ({
        ...(source.brandId ? { brandId: source.brandId } : {}),
        organizationId: source.organizationId,
        sourceId: source.id,
        userId: source.userId,
      })),
    };
  }

  private optionalOutcome(
    value: unknown,
  ): RssItemClaim | RssItemRelease | undefined {
    if (value === undefined) return undefined;
    return this.unwrapBranch<RssItemClaim | RssItemRelease>(value);
  }

  private unwrapBranch<T>(value: unknown): T {
    if (value && typeof value === 'object' && 'data' in value) {
      return (value as { data: T }).data;
    }
    return value as T;
  }
}
