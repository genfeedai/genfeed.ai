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

    it('omits incomplete previous evaluations', () => {
      const result = projection.buildPostEvaluationContext(
        { description: 'Standalone post' },
        [],
        {
          data: {
            overallScore: 84,
            scores: { brand: { overall: 81 } },
            status: Status.PROCESSING,
          },
          updatedAt: new Date('2026-07-01T00:00:00.000Z'),
        },
      );

      expect(result).toEqual({
        context: {
          brand: undefined,
          isThread: false,
          label: undefined,
          platform: undefined,
          previousEvaluation: undefined,
          threadLength: 1,
        },
        threadContent: 'Standalone post',
      });
    });
  });

  describe('buildComparisonResult', () => {
    it('preserves weighted scoring, ranking, and response projection', () => {
      const result = projection.buildComparisonResult(
        ['eval-a', 'eval-b'],
        [
          {
            contentId: 'post-b',
            contentType: 'post',
            data: {
              analysis: { strengths: ['Clear'], weaknesses: ['Generic'] },
              overallScore: 70,
              review: { reviewerScore: 68 },
              scores: {
                brand: { overall: 70 },
                engagement: { overall: 70 },
                technical: { overall: 70 },
              },
              status: Status.COMPLETED,
            },
            id: 'eval-b',
            updatedAt: new Date('2026-07-01T00:00:00.000Z'),
          },
          {
            contentId: 'post-a',
            contentType: 'post',
            data: {
              analysis: {
                strengths: ['Strong hook'],
                weaknesses: ['Long CTA'],
              },
              evaluationType: 'pre_publication',
              overallScore: 85,
              review: {
                comment: 'Best candidate.',
                reviewedAt: '2026-07-02T00:00:00.000Z',
                reviewerScore: 90,
              },
              scores: {
                brand: { overall: 82 },
                engagement: { overall: 88 },
                technical: { overall: 80 },
              },
              status: Status.COMPLETED,
            },
            id: 'eval-a',
            updatedAt: new Date('2026-07-02T00:00:00.000Z'),
          },
        ],
        '2026-07-03T00:00:00.000Z',
      );

      expect(result).toMatchObject({
        comparedAt: '2026-07-03T00:00:00.000Z',
        evaluationIds: ['eval-a', 'eval-b'],
        rankings: [
          {
            compositeScore: 86,
            evaluationId: 'eval-a',
            rank: 1,
            reviewerComment: 'Best candidate.',
            scoreBreakdown: {
              brandScore: 82,
              engagementScore: 88,
              modelScore: 85,
              reviewerScore: 90,
              technicalScore: 80,
            },
          },
          {
            compositeScore: 69.5,
            evaluationId: 'eval-b',
            rank: 2,
          },
        ],
        winnerEvaluationId: 'eval-a',
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
