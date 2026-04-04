import {
  ContentPerformance,
  ContentPerformanceSchema,
  PerformanceSource,
} from '@api/collections/content-performance/schemas/content-performance.schema';

describe('ContentPerformanceSchema', () => {
  it('should be defined', () => {
    expect(ContentPerformance).toBeDefined();
    expect(ContentPerformanceSchema).toBeDefined();
  });

  it('should have correct collection name', () => {
    const schema = ContentPerformanceSchema;
    expect((schema as any).options.collection).toBe('content-performance');
  });

  it('should have timestamps enabled', () => {
    const schema = ContentPerformanceSchema;
    expect((schema as any).options.timestamps).toBe(true);
  });

  it('should export PerformanceSource enum', () => {
    expect(PerformanceSource.API).toBe('api');
    expect(PerformanceSource.MANUAL).toBe('manual');
    expect(PerformanceSource.WEBHOOK).toBe('webhook');
    expect(PerformanceSource.CSV).toBe('csv');
  });

  it('should have all required paths', () => {
    const paths = ContentPerformanceSchema.paths;
    expect(paths.organization).toBeDefined();
    expect(paths.brand).toBeDefined();
    expect(paths.user).toBeDefined();
    expect(paths.platform).toBeDefined();
    expect(paths.contentType).toBeDefined();
    expect(paths.measuredAt).toBeDefined();
    expect(paths.views).toBeDefined();
    expect(paths.likes).toBeDefined();
    expect(paths.comments).toBeDefined();
    expect(paths.shares).toBeDefined();
    expect(paths.saves).toBeDefined();
    expect(paths.clicks).toBeDefined();
    expect(paths.revenue).toBeDefined();
    expect(paths.engagementRate).toBeDefined();
    expect(paths.performanceScore).toBeDefined();
    expect(paths.cycleNumber).toBeDefined();
    expect(paths.source).toBeDefined();
    expect(paths.generationId).toBeDefined();
    expect(paths.workflowExecutionId).toBeDefined();
    expect(paths.promptUsed).toBeDefined();
    expect(paths.hookUsed).toBeDefined();
    expect(paths.post).toBeDefined();
    expect(paths.externalPostId).toBeDefined();
  });

  it('should have default values for metrics', () => {
    const viewsPath = ContentPerformanceSchema.paths.views as any;
    expect(viewsPath.options.default).toBe(0);

    const likesPath = ContentPerformanceSchema.paths.likes as any;
    expect(likesPath.options.default).toBe(0);
  });

  it('should have performanceScore bounded 0-100', () => {
    const scorePath = ContentPerformanceSchema.paths.performanceScore as any;
    expect(scorePath.options.min).toBe(0);
    expect(scorePath.options.max).toBe(100);
  });
});
