import { AnalyticsProviderCollectionService } from '@api/analytics/services/analytics-provider-collection.service';
import { AnalyticsSocialCollectionService } from '@api/analytics/services/analytics-social-collection.service';
import { AnalyticsTwitterCollectionService } from '@api/analytics/services/analytics-twitter-collection.service';
import { AnalyticsYouTubeCollectionService } from '@api/analytics/services/analytics-youtube-collection.service';
import { PostAnalyticsCollectionStateService } from '@api/analytics/services/post-analytics-collection-state.service';
import { AnalyticsSyncService } from '@api/collections/content-performance/services/analytics-sync.service';
import { OutliersCoreModule } from '@api/collections/outliers/outliers-core.module';
import { OutliersService } from '@api/collections/outliers/services/outliers.service';
import { PostAnalyticsService } from '@api/collections/posts/services/post-analytics.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { AnalyticsSyncWorkflowService } from '@api/collections/workflows/services/analytics-sync-workflow.service';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test } from '@nestjs/testing';

describe('Outlier core dependency injection', () => {
  it('resolves the account finalizer dependency used by HTTP and workers', async () => {
    const module = await Test.createTestingModule({
      imports: [OutliersCoreModule],
      providers: [
        AnalyticsSyncWorkflowService,
        ...[
          PostsService,
          PostAnalyticsCollectionStateService,
          AnalyticsProviderCollectionService,
          AnalyticsSocialCollectionService,
          AnalyticsTwitterCollectionService,
          AnalyticsYouTubeCollectionService,
          AnalyticsSyncService,
          WorkflowExecutionQueueService,
          SystemWorkflowRunnerService,
        ].map((provide) => ({ provide, useValue: {} })),
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
    expect(module.get(AnalyticsSyncWorkflowService)).toBeInstanceOf(
      AnalyticsSyncWorkflowService,
    );
    await module.close();
  });
  it('provides the awaited refresh dependency to direct analytics providers used by workers', async () => {
    const module = await Test.createTestingModule({
      imports: [OutliersCoreModule],
      providers: [
        PostAnalyticsService,
        { provide: PostsService, useValue: {} },
        { provide: LoggerService, useValue: {} },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
    expect(module.get(PostAnalyticsService)).toBeInstanceOf(
      PostAnalyticsService,
    );
    expect(module.get(OutliersService)).toBeInstanceOf(OutliersService);
    await module.close();
  });
});
