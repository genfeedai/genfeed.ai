import { readFileSync } from 'node:fs';
import { AnalyticsProviderCollectionService } from '@api/analytics/services/analytics-provider-collection.service';
import { AnalyticsSocialCollectionService } from '@api/analytics/services/analytics-social-collection.service';
import { AnalyticsTwitterCollectionService } from '@api/analytics/services/analytics-twitter-collection.service';
import { AnalyticsYouTubeCollectionService } from '@api/analytics/services/analytics-youtube-collection.service';
import { PostAnalyticsCollectionStateService } from '@api/analytics/services/post-analytics-collection-state.service';
import { BotActivitiesService } from '@api/collections/bot-activities/services/bot-activities.service';
import { CampaignTargetsService } from '@api/collections/campaign-targets/services/campaign-targets.service';
import { AnalyticsSyncService } from '@api/collections/content-performance/services/analytics-sync.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { MonitoredAccountsService } from '@api/collections/monitored-accounts/services/monitored-accounts.service';
import { OutliersService } from '@api/collections/outliers/services/outliers.service';
import { OutreachCampaignsService } from '@api/collections/outreach-campaigns/services/outreach-campaigns.service';
import { AnalyticsCollectionModule } from '@api/collections/posts/analytics-collection.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { ProcessedTweetsService } from '@api/collections/processed-tweets/services/processed-tweets.service';
import { ReplyBotConfigsService } from '@api/collections/reply-bot-configs/services/reply-bot-configs.service';
import { AGENT_RUNTIME_WORKFLOW_DEFINITIONS } from '@api/collections/workflows/services/agent-runtime-workflow-definitions';
import { AnalyticsSyncWorkflowService } from '@api/collections/workflows/services/analytics-sync-workflow.service';
import { SystemWorkflowDefinitionRegistrarService } from '@api/collections/workflows/services/system-workflow-definition-registrar.service';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import {
  ANALYTICS_COLLECTION_CHILD_WORKFLOWS,
  ANALYTICS_GENERIC_CHILD_WORKFLOWS,
} from '@api/collections/workflows/templates/analytics-sync-workflows.template';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { WORKFLOW_ENGINE_ADAPTER } from '@api/collections/workflows/workflows.tokens';
import { WorkflowsCoreModule } from '@api/collections/workflows/workflows-core.module';
import { CampaignExecutorService } from '@api/services/campaign/campaign-executor.service';
import { DmCampaignExecutorService } from '@api/services/campaign/dm-campaign-executor.service';
import { AuthorReplyLoopService } from '@api/services/reply-bot/author-reply-loop.service';
import { BotActionExecutorService } from '@api/services/reply-bot/bot-action-executor.service';
import { RateLimitService } from '@api/services/reply-bot/rate-limit.service';
import { ReplyBotOrchestratorService } from '@api/services/reply-bot/reply-bot-orchestrator.service';
import { ReplyCandidatePrefilterService } from '@api/services/reply-bot/reply-candidate-prefilter.service';
import { ReplyGenerationService } from '@api/services/reply-bot/reply-generation.service';
import { ReplyIntentClassifierService } from '@api/services/reply-bot/reply-intent-classifier.service';
import { SocialMonitorService } from '@api/services/reply-bot/social-monitor.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ALL_ACTIONS } from '@genfeedai/actions';
import { CredentialPlatform } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

describe('system workflow registration composition', () => {
  it('connects both definition owners to the same runner through the production module graph', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, WorkflowsModule),
    ).toContain(PostsModule);
    expect(
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, WorkflowsModule),
    ).toContain(WorkflowsCoreModule);
    expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, PostsModule)).toContain(
      AnalyticsCollectionModule,
    );
    expect(
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, AnalyticsCollectionModule),
    ).toContain(WorkflowsCoreModule);
    expect(
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AnalyticsCollectionModule),
    ).toContain(AnalyticsSyncWorkflowService);
    expect(
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, WorkflowsModule),
    ).toContain(SystemWorkflowDefinitionRegistrarService);
    expect(
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, WorkflowsCoreModule),
    ).toContain(SystemWorkflowRunnerService);
    expect(
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, WorkflowsModule),
    ).not.toContain(SystemWorkflowRunnerService);
    expect(
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AnalyticsCollectionModule),
    ).not.toContain(SystemWorkflowRunnerService);
  });

  it('keeps active worker scheduling on the same workflow registration graph', () => {
    const workerApp = readFileSync(
      new URL('../../../../../workers/src/app.module.ts', import.meta.url),
      'utf8',
    );
    const workerSchedules = readFileSync(
      new URL(
        '../../../../../workers/src/scheduling/platform-schedules.module.ts',
        import.meta.url,
      ),
      'utf8',
    );

    expect(workerApp).toContain(
      "import { PlatformSchedulesModule } from '@workers/scheduling/platform-schedules.module'",
    );
    expect(workerApp).toMatch(
      /imports:\s*\[[\s\S]*?\bPlatformSchedulesModule,/,
    );
    expect(workerSchedules).toContain(
      "import { WorkflowsModule } from '@api/collections/workflows/workflows.module'",
    );
    expect(workerSchedules).toMatch(/imports:\s*\[[\s\S]*?\bWorkflowsModule,/);
  });

  it('boots both definition owners without collisions and retains strict duplicate rejection', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        SystemWorkflowRunnerService,
        AnalyticsSyncWorkflowService,
        SystemWorkflowDefinitionRegistrarService,
        CampaignExecutorService,
        DmCampaignExecutorService,
        ReplyBotOrchestratorService,
        ...[
          PrismaService,
          PostsService,
          PostAnalyticsCollectionStateService,
          AnalyticsProviderCollectionService,
          AnalyticsSocialCollectionService,
          AnalyticsTwitterCollectionService,
          AnalyticsYouTubeCollectionService,
          AnalyticsSyncService,
          WorkflowExecutionQueueService,
          OutliersService,
          BotActivitiesService,
          CampaignTargetsService,
          CredentialsService,
          MonitoredAccountsService,
          OutreachCampaignsService,
          ProcessedTweetsService,
          ReplyBotConfigsService,
          AuthorReplyLoopService,
          BotActionExecutorService,
          RateLimitService,
          ReplyCandidatePrefilterService,
          ReplyGenerationService,
          ReplyIntentClassifierService,
          SocialMonitorService,
          LoggerService,
        ].map((provide) => ({ provide, useValue: {} })),
        {
          provide: WORKFLOW_ENGINE_ADAPTER,
          useValue: {
            registerExecutor: vi.fn(),
            getRegisteredActionIds: () =>
              ALL_ACTIONS.map((action) => action.id),
          },
        },
      ],
    }).compile();

    try {
      await moduleRef.init();
      const runner = moduleRef.get(SystemWorkflowRunnerService);
      const expectedIds = [
        'analytics-sync',
        'analytics.organization-refresh',
        ...[
          CredentialPlatform.FACEBOOK,
          CredentialPlatform.INSTAGRAM,
          CredentialPlatform.LINKEDIN,
          CredentialPlatform.MASTODON,
          CredentialPlatform.PINTEREST,
          CredentialPlatform.THREADS,
          CredentialPlatform.TIKTOK,
          CredentialPlatform.TWITTER,
          CredentialPlatform.YOUTUBE,
        ].map((platform) => `analytics.post-refresh.${platform}`),
        ...ANALYTICS_COLLECTION_CHILD_WORKFLOWS.map(
          (definition) => definition.canonicalId,
        ),
        ...ANALYTICS_GENERIC_CHILD_WORKFLOWS.map(
          (definition) => definition.canonicalId,
        ),
        ...AGENT_RUNTIME_WORKFLOW_DEFINITIONS.map(
          (definition) => definition.canonicalId,
        ),
        'content-loop-autopilot',
        'campaign.dispatch.active',
        'campaign.dm.process-pending-targets',
        'campaign.reply.process-pending-targets',
        'reply-bot.process-organization',
      ];
      for (const canonicalId of expectedIds) {
        expect(runner.getWorkflow(canonicalId), canonicalId).toMatchObject({
          canonicalId,
        });
      }

      const analytics = runner.getWorkflow('analytics-sync');
      expect(
        analytics?.definition.inputVariables?.map((input) => input.key),
      ).toEqual(['brandId', 'since']);
      expect(analytics?.definition.nodes.map((node) => node.id)).toContain(
        'sync-each-item',
      );
      expect(() =>
        moduleRef.get(AnalyticsSyncWorkflowService).onModuleInit(),
      ).toThrow('Duplicate system workflow definition: analytics-sync');
    } finally {
      await moduleRef.close();
    }
  });
});
