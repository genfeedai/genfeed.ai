import {
  PostFormat,
  PostStatus,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { PublicPostSerializer } from '@serializers/server/content/post.serializer';
import { describe, expect, it } from 'vitest';

describe('PublicPostSerializer', () => {
  it('excludes private ownership, credential, and workflow data', () => {
    const document = PublicPostSerializer.serialize({
      workflowExecutionId: 'run_1',
      brandId: 'brand_1',
      createdAt: new Date('2026-08-05T00:00:00.000Z'),
      credential: { id: 'credential_1', isConnected: true },
      credentialId: 'credential_1',
      description: 'Public post body',
      format: PostFormat.LONG_FORM,
      id: 'post_1',
      label: 'Public post',
      organizationId: 'org_1',
      platform: 'instagram',
      promptUsed: 'private generation prompt',
      status: PostStatus.PUBLIC,
      targetExecutionState: TargetExecutionState.PUBLISHED,
      updatedAt: new Date('2026-08-05T01:00:00.000Z'),
      user: { email: 'private@example.com', id: 'user_1' },
      userId: 'user_1',
      visibility: PostVisibility.PUBLIC,
    }) as {
      data: {
        attributes: Record<string, unknown>;
        relationships?: Record<string, unknown>;
      };
      included?: unknown[];
    };

    expect(document.data.attributes).toMatchObject({
      description: 'Public post body',
      format: PostFormat.LONG_FORM,
      label: 'Public post',
      platform: 'instagram',
      status: PostStatus.PUBLIC,
      targetExecutionState: TargetExecutionState.PUBLISHED,
      visibility: PostVisibility.PUBLIC,
    });
    expect(document.data.attributes).not.toHaveProperty('workflowExecutionId');
    expect(document.data.attributes).not.toHaveProperty('brandId');
    expect(document.data.attributes).not.toHaveProperty('credential');
    expect(document.data.attributes).not.toHaveProperty('credentialId');
    expect(document.data.attributes).not.toHaveProperty('organizationId');
    expect(document.data.attributes).not.toHaveProperty('promptUsed');
    expect(document.data.attributes).not.toHaveProperty('user');
    expect(document.data.attributes).not.toHaveProperty('userId');
    expect(document.data.relationships).toBeUndefined();
    expect(document.included).toBeUndefined();
  });
});
