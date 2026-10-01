import { getDeserializer } from '@genfeedai/helpers';
import { ArticleSerializer } from '@serializers/server/content/article.serializer';
import {
  PostListSerializer,
  PostSerializer,
} from '@serializers/server/content/post.serializer';
import { IngredientSerializer } from '@serializers/server/ingredients/ingredient.serializer';
import { VideoSerializer } from '@serializers/server/ingredients/video.serializer';
import { describe, expect, it } from 'vitest';

const evaluation = {
  id: 'saved-evaluation',
  organizationId: 'org',
  userId: 'canonical-user',
  contentType: 'video',
  contentId: 'content',
  isDeleted: false,
  createdAt: new Date('2026-09-01'),
  updatedAt: new Date('2026-09-02'),
  data: {
    status: 'completed',
    brandId: 'brand',
    overallScore: 72,
    scores: {
      persuasion: {
        overall: 50,
        demandFit: 20,
        hookStrength: 40,
        openLoopIntegrity: 60,
        ctaNaturalness: 80,
      },
    },
    analysis: {
      strengths: ['Saved observation'],
      weaknesses: ['Saved weakness'],
      suggestions: ['Saved suggestion'],
      aiModel: 'fixture',
    },
  },
};
describe('Persisted evaluation serializer to client deserializer lineage', () => {
  it.each([
    ['video', VideoSerializer],
    ['ingredient', IngredientSerializer],
    ['post detail', PostSerializer],
    ['post list', PostListSerializer],
    ['article', ArticleSerializer],
  ])(
    'preserves canonical nested evaluation data for %s detail and collection',
    (_name, serializer) => {
      const content = {
        id: 'content',
        label: 'Saved content',
        organizationId: 'org',
        evaluation,
      };
      const detail = getDeserializer(serializer.serialize(content));
      expect(detail).toMatchObject({
        id: 'content',
        evaluation: {
          id: 'saved-evaluation',
          organizationId: 'org',
          userId: 'canonical-user',
          contentId: 'content',
          contentType: 'video',
          data: evaluation.data,
        },
      });
      const list = getDeserializer(serializer.serialize([content]));
      expect(list).toEqual([detail]);
    },
  );
  it.each(['processing', 'failed'])(
    'preserves status-only %s without synthesizing scores',
    (status) => {
      const statusOnly = { ...evaluation, data: { status, brandId: 'brand' } };
      const result = getDeserializer(
        VideoSerializer.serialize({ id: 'content', evaluation: statusOnly }),
      );
      expect(result).toMatchObject({
        evaluation: {
          id: 'saved-evaluation',
          data: { status, brandId: 'brand' },
        },
      });
      expect(result).not.toHaveProperty('evaluation.data.scores');
    },
  );
  it('keeps no evaluation distinct from score-only persisted analysis', () => {
    const result = getDeserializer(
      VideoSerializer.serialize({ id: 'content', evaluation: null }),
    );
    expect(result).toMatchObject({ evaluation: null });
  });
});
