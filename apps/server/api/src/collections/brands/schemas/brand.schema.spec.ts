import {
  Brand,
  type BrandDocument,
  BrandSchema,
} from '@api/collections/brands/schemas/brand.schema';
import mongoose, { Model, Types } from 'mongoose';

describe('BrandSchema', () => {
  let model: Model<BrandDocument>;

  beforeAll(() => {
    model = mongoose.model<BrandDocument>(
      `BrandSchemaSpec${Date.now()}`,
      BrandSchema,
    );
  });

  it('supports valid agentConfig payload', () => {
    const doc = new model({
      agentConfig: {
        autoPublish: {
          confidenceThreshold: 0.8,
          enabled: true,
        },
        enabledSkills: ['content-writing', 'trend-discovery'],
        schedule: {
          cronExpression: '0 */6 * * *',
          enabled: true,
          timezone: 'UTC',
        },
        strategy: {
          contentTypes: ['video', 'thread'],
          frequency: 'daily',
          goals: ['engagement'],
          platforms: ['twitter', 'instagram'],
        },
        voice: {
          audience: 'creators',
          style: 'clear and concise',
          tone: 'authoritative',
          values: ['clarity', 'consistency'],
        },
      },
      isSelected: true,
      label: 'Test Brand',
      organization: new Types.ObjectId(),
      slug: 'test-handle',
    });

    const error = doc.validateSync();

    expect(error).toBeUndefined();
  });

  it('rejects invalid autoPublish confidenceThreshold', () => {
    const doc = new model({
      agentConfig: {
        autoPublish: {
          confidenceThreshold: 1.5,
          enabled: true,
        },
        enabledSkills: ['content-writing'],
        schedule: {
          enabled: true,
        },
        strategy: {
          contentTypes: ['video'],
          frequency: 'daily',
          goals: ['engagement'],
          platforms: ['twitter'],
        },
        voice: {
          audience: 'creators',
          style: 'direct',
          tone: 'bold',
          values: ['clarity'],
        },
      },
      isSelected: true,
      label: 'Test Brand 2',
      organization: new Types.ObjectId(),
      slug: 'test-handle-2',
    });

    const error = doc.validateSync();

    expect(error).toBeDefined();
    expect(
      error?.errors['agentConfig.autoPublish.confidenceThreshold'],
    ).toBeDefined();
  });

  it('should be defined', () => {
    expect(Brand).toBeDefined();
    expect(BrandSchema).toBeDefined();
  });
});
