import { contentPerformanceAttributes } from '@serializers/attributes/content/content-performance.attributes';
import { ContentPerformanceSerializer } from '@serializers/server/content/content-performance.serializer';
import { describe, expect, it } from 'vitest';

describe('ContentPerformanceSerializer canonical identity contract', () => {
  it('emits canonical scalar ids and provider identity', () => {
    const output = ContentPerformanceSerializer.serialize({
      brandId: 'brand-1',
      externalPostId: 'provider-post-1',
      generationId: 'generation-1',
      id: 'performance-1',
      organizationId: 'organization-1',
      postId: 'post-1',
      userId: 'user-1',
      views: 100,
      workflowExecutionId: 'workflow-execution-1',
    }) as {
      data: {
        attributes: Record<string, unknown>;
        id: string;
        relationships?: Record<string, unknown>;
      };
    };

    expect(contentPerformanceAttributes).toEqual(
      expect.arrayContaining([
        'brandId',
        'externalPostId',
        'organizationId',
        'postId',
        'userId',
        'workflowExecutionId',
      ]),
    );
    expect(output.data.id).toBe('performance-1');
    expect(output.data.attributes).toMatchObject({
      brandId: 'brand-1',
      externalPostId: 'provider-post-1',
      generationId: 'generation-1',
      organizationId: 'organization-1',
      postId: 'post-1',
      userId: 'user-1',
      workflowExecutionId: 'workflow-execution-1',
    });
    expect(contentPerformanceAttributes).not.toEqual(
      expect.arrayContaining(['_id', 'brand', 'organization', 'user']),
    );
    expect(output.data).not.toHaveProperty('relationships');
  });
});
