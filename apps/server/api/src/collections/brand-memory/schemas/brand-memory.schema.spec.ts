import {
  BrandMemory,
  BrandMemorySchema,
} from '@api/collections/brand-memory/schemas/brand-memory.schema';

describe('BrandMemorySchema', () => {
  it('should be defined', () => {
    expect(BrandMemory).toBeDefined();
    expect(BrandMemorySchema).toBeDefined();
  });

  it('should use expected collection and timestamps', () => {
    expect(BrandMemorySchema.get('collection')).toBe('brand-memory');
    expect(BrandMemorySchema.get('timestamps')).toBe(true);
  });

  it('should include required top-level fields', () => {
    const paths = BrandMemorySchema.paths;

    expect(paths.organization).toBeDefined();
    expect(paths.brand).toBeDefined();
    expect(paths.date).toBeDefined();
    expect(paths.isDeleted).toBeDefined();
    expect(paths.entries).toBeDefined();
    expect(paths.insights).toBeDefined();
    expect(paths.metrics).toBeDefined();
  });

  it('should define entries as an array', () => {
    const entriesPath = BrandMemorySchema.paths.entries;
    expect(entriesPath).toBeDefined();
    // entries is a DocumentArray in Mongoose
    expect(entriesPath.instance).toMatch(/Array/i);
  });

  it('should define insights as an array', () => {
    const insightsPath = BrandMemorySchema.paths.insights;
    expect(insightsPath).toBeDefined();
    expect(insightsPath.instance).toMatch(/Array/i);
  });

  it('should define metrics as embedded document', () => {
    const metricsPath = BrandMemorySchema.paths.metrics;
    expect(metricsPath).toBeDefined();
  });
});
