import { EvaluationResultProjection } from '@api/collections/evaluations/services/evaluation-result.projection';
import { Status } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

const projection = new EvaluationResultProjection();

describe('EvaluationResultProjection', () => {
  describe('buildPostEvaluationContext', () => {
    it('sorts thread children and projects completed previous scores', () => {
      const result = projection.buildPostEvaluationContext(
        {
          brand: { guidelines: 'Stay direct.', name: 'Genfeed' },
          description: 'Root post',
          label: 'Launch',
          platform: 'linkedin',
        },
        [
          { description: 'Third', order: 3 },
          { description: 'Second', order: 2 },
        ],
        {
          data: {
            overallScore: 84,
            scores: {
              brand: { overall: 81 },
              engagement: { overall: 86 },
              technical: { overall: 83 },
            },
            status: Status.COMPLETED,
          },
          updatedAt: new Date('2026-07-01T00:00:00.000Z'),
        },
      );

      expect(result).toEqual({
        context: {
          brand: {
            description: 'Stay direct.',
            label: 'Genfeed',
            text: 'Stay direct.',
          },
          isThread: true,
          label: 'Launch',
          platform: 'linkedin',
          previousEvaluation: {
            overallScore: 84,
            scores: {
              brand: { overall: 81 },
              engagement: { overall: 86 },
              technical: { overall: 83 },
            },
            updatedAt: new Date('2026-07-01T00:00:00.000Z'),
          },
          threadLength: 3,
        },
        threadContent: 'Root post\n---\nSecond\n---\nThird',
      });
    });
  });

  describe('review and storage projection', () => {
    it('cleans tags, retains valid comments, and removes undefined JSON data', () => {
      const tags = projection.buildReviewTags([' launch ', '', 'video']);
      const result = projection.buildReviewData({
        comment: 'Ship this.',
        decision: 'approved',
        existingData: {
          reviewerComments: [
            {
              comment: 'Earlier note.',
              createdAt: '2026-07-01T00:00:00.000Z',
              reviewerId: 'user-1',
            },
            {
              comment: '',
              createdAt: '2026-07-01T00:00:00.000Z',
              reviewerId: 'invalid',
            },
          ],
          scores: undefined,
          status: Status.COMPLETED,
        },
        reviewedAt: '2026-07-02T00:00:00.000Z',
        reviewerId: 'user-2',
        reviewerScore: 92,
        tags,
      });

      expect(result).toEqual({
        review: {
          comment: 'Ship this.',
          decision: 'approved',
          reviewedAt: '2026-07-02T00:00:00.000Z',
          reviewerId: 'user-2',
          reviewerScore: 92,
          tags: ['launch', 'video'],
        },
        reviewerComments: [
          {
            comment: 'Earlier note.',
            createdAt: '2026-07-01T00:00:00.000Z',
            reviewerId: 'user-1',
          },
          {
            comment: 'Ship this.',
            createdAt: '2026-07-02T00:00:00.000Z',
            decision: 'approved',
            reviewerId: 'user-2',
          },
        ],
        status: Status.COMPLETED,
      });
    });
  });

  describe('buildEvaluationTrends', () => {
    it('filters scores and returns date-sorted averages', () => {
      const result = projection.buildEvaluationTrends(
        [
          {
            data: {
              evaluationType: 'pre_publication',
              overallScore: 90,
              scores: {
                brand: { overall: 80 },
                engagement: { overall: 100 },
                technical: { overall: 70 },
              },
            },
            updatedAt: new Date('2026-07-02T12:00:00.000Z'),
          },
          {
            data: {
              evaluationType: 'pre_publication',
              overallScore: 70,
              scores: {
                brand: { overall: 60 },
                engagement: { overall: 80 },
                technical: { overall: 90 },
              },
            },
            updatedAt: new Date('2026-07-02T08:00:00.000Z'),
          },
          {
            data: {
              evaluationType: 'pre_publication',
              overallScore: 75,
              scores: { brand: { overall: 75 } },
            },
            updatedAt: new Date('2026-07-01T08:00:00.000Z'),
          },
          {
            data: {
              evaluationType: 'post_publication',
              overallScore: 99,
            },
            updatedAt: new Date('2026-07-03T08:00:00.000Z'),
          },
        ],
        {
          evaluationType: 'pre_publication',
          minScore: '70',
          maxScore: '90',
        },
      );

      expect(result).toEqual([
        {
          avgBrandScore: 75,
          avgEngagementScore: 0,
          avgScore: 75,
          avgTechnicalScore: 0,
          count: 1,
          date: '2026-07-01',
        },
        {
          avgBrandScore: 70,
          avgEngagementScore: 90,
          avgScore: 80,
          avgTechnicalScore: 80,
          count: 2,
          date: '2026-07-02',
        },
      ]);
    });
  });

  describe('buildActualPerformanceData', () => {
    it('preserves the performance accuracy formula and zero defaults', () => {
      expect(
        projection.buildActualPerformanceData(
          { status: Status.COMPLETED },
          { engagement: 65 },
          80,
          '2026-07-04T00:00:00.000Z',
        ),
      ).toEqual({
        actualPerformance: {
          accuracyScore: 85,
          engagement: 65,
          engagementRate: 0,
          syncedAt: '2026-07-04T00:00:00.000Z',
          views: 0,
        },
        status: Status.COMPLETED,
      });
    });
  });
});
