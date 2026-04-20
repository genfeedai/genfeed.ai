import type { PipelineStage } from '@api/shared/utils/pipeline-builder/pipeline-builder.types';
import { PipelineBuilder } from '@api/shared/utils/pipeline-builder/pipeline-builder.util';
import { describe, expect, it } from 'vitest';

function hasLookup(
  stage: PipelineStage,
): stage is PipelineStage & { $lookup: { as: string; from: string } } {
  return '$lookup' in stage;
}

describe('PipelineBuilder', () => {
  describe('static create()', () => {
    it('creates a new PipelineBuilder instance', () => {
      const builder = PipelineBuilder.create();
      expect(builder).toBeInstanceOf(PipelineBuilder);
    });
  });

  describe('static buildMatch()', () => {
    it('creates a $match stage', () => {
      const stage = PipelineBuilder.buildMatch({ isDeleted: false });
      expect(stage).toEqual({ $match: { isDeleted: false } });
    });

    it('creates a $match with multiple conditions', () => {
      const stage = PipelineBuilder.buildMatch({
        status: 'active',
        type: 'image',
      });
      expect(stage).toEqual({ $match: { status: 'active', type: 'image' } });
    });
  });

  describe('static buildSort()', () => {
    it('creates a $sort stage', () => {
      const stage = PipelineBuilder.buildSort({ createdAt: -1 });
      expect(stage).toEqual({ $sort: { createdAt: -1 } });
    });

    it('sorts by multiple fields', () => {
      const stage = PipelineBuilder.buildSort({ createdAt: -1, label: 1 });
      expect(stage).toEqual({ $sort: { createdAt: -1, label: 1 } });
    });
  });

  describe('static buildLookup()', () => {
    it('creates a $lookup stage', () => {
      const stage = PipelineBuilder.buildLookup({
        as: 'user',
        foreignField: '_id',
        from: 'users',
        localField: 'userId',
      });
      expect(hasLookup(stage)).toBe(true);
      if (!hasLookup(stage)) {
        throw new Error('Expected lookup stage');
      }
      const lookup = stage.$lookup;
      expect(lookup.from).toBe('users');
      expect(lookup.as).toBe('user');
    });
  });

  describe('builder pattern', () => {
    it('builds an empty pipeline', () => {
      const pipeline = PipelineBuilder.create().build();
      expect(pipeline).toEqual([]);
    });

    it('builds pipeline with match stage', () => {
      const pipeline = PipelineBuilder.create()
        .match({ isDeleted: false })
        .build();
      expect(pipeline).toHaveLength(1);
      expect(pipeline[0]).toEqual({ $match: { isDeleted: false } });
    });

    it('merges multiple match calls', () => {
      const pipeline = PipelineBuilder.create()
        .match({ isDeleted: false })
        .match({ status: 'active' })
        .build();
      // Multiple matches get merged into one
      expect(pipeline).toHaveLength(1);
      expect(pipeline[0]).toHaveProperty('$match');
    });

    it('builds pipeline with sort stage', () => {
      const pipeline = PipelineBuilder.create()
        .match({ isDeleted: false })
        .sort({ createdAt: -1 })
        .build();
      expect(pipeline).toHaveLength(2);
    });

    it('matchIf adds stage when condition is true', () => {
      const pipeline = PipelineBuilder.create()
        .matchIf(true, { status: 'active' })
        .build();
      expect(pipeline).toHaveLength(1);
    });

    it('matchIf skips stage when condition is false', () => {
      const pipeline = PipelineBuilder.create()
        .matchIf(false, { status: 'active' })
        .build();
      expect(pipeline).toHaveLength(0);
    });

    it('supports method chaining', () => {
      const builder = PipelineBuilder.create();
      const result = builder
        .match({ isDeleted: false })
        .sort({ createdAt: -1 });
      expect(result).toBe(builder);
    });
  });
});
