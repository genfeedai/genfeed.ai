import { OutliersCoreModule } from '@api/collections/outliers/outliers-core.module';
import { OutliersService } from '@api/collections/outliers/services/outliers.service';
import { PostAnalyticsService } from '@api/collections/posts/services/post-analytics.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test } from '@nestjs/testing';

describe('Outlier core dependency injection', () => {
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
