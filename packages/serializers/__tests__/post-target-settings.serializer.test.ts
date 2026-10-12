import {
  PostListSerializer,
  PostSerializer,
  PublicPostSerializer,
} from '@serializers/server/content/post.serializer';
import { describe, expect, it } from 'vitest';

const post = {
  id: 'post-1',
  platform: 'tiktok',
  targetSettings: {
    privacyLevel: 'private',
    musicUsageAccepted: true,
    allowComments: false,
    internal: { accessToken: 'private-token' },
    workflowApprovedSchedule: 'private-operation',
  },
};

describe('post target settings serialization', () => {
  it.each([PostSerializer, PostListSerializer])(
    'exposes declared publishing choices and excludes internal settings',
    (serializer) => {
      const document = serializer.serialize(post);
      expect(document).toMatchObject({
        data: {
          attributes: {
            targetSettings: {
              privacyLevel: 'private',
              musicUsageAccepted: true,
              allowComments: false,
            },
          },
        },
      });
      expect(JSON.stringify(document)).not.toContain('private-token');
      expect(JSON.stringify(document)).not.toContain('private-operation');
      expect(post.targetSettings.internal.accessToken).toBe('private-token');
    },
  );

  it('does not expose undeclared or invalid publishing values', () => {
    const document = PostSerializer.serialize({
      ...post,
      targetSettings: {
        privacyLevel: { token: 'private-token' },
        internal: true,
      },
    });
    expect(document).not.toMatchObject({
      data: { attributes: { targetSettings: expect.anything() } },
    });
  });

  it('keeps publishing choices out of public post responses', () => {
    expect(PublicPostSerializer.serialize(post)).not.toMatchObject({
      data: { attributes: { targetSettings: expect.anything() } },
    });
  });
});
