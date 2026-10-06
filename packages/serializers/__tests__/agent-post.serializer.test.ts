import {
  ingredientResponseIds,
  projectMediaResponse,
} from '../src/helpers/media-delivery-projection.helper';
import { serializeAgentPost } from '../src/server/threads/agent-post.serializer';

const post = {
  id: 'post-1',
  organizationId: 'org-1',
  brandId: 'brand-1',
  credentialId: 'account-1',
  platform: 'twitter',
  description: 'Hello',
  credential: {
    id: 'account-1',
    organizationId: 'org-1',
    brandId: 'brand-1',
    platform: 'TWITTER',
    isDeleted: false,
    externalName: 'Genfeed',
    externalHandle: 'genfeed',
    externalAvatar: 'https://pbs.twimg.com/profile.png',
    accessToken: 'secret',
  },
  ingredients: [
    {
      id: 'image-1',
      category: 'IMAGE',
      organizationId: 'org-1',
      isDeleted: false,
      cdnUrl: 'https://cdn.genfeed.ai/image.png',
      s3Key: 'private-key',
    },
  ],
};

describe('agent post preview projection', () => {
  it('keeps the target account and grant-recognizable media identity without secrets', () => {
    const result = serializeAgentPost(post);
    expect(result.author).toEqual({
      name: 'Genfeed',
      handle: 'genfeed',
      avatarUrl: 'https://pbs.twimg.com/profile.png',
    });
    expect(result.media).toEqual([
      {
        assetId: 'image-1',
        ingredientId: 'image-1',
        kind: 'image',
        order: 0,
        url: 'https://cdn.genfeed.ai/image.png',
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(JSON.stringify(result)).not.toContain('private-key');
    expect(ingredientResponseIds(result)).toEqual(['image-1']);
    const authorized = projectMediaResponse(
      result,
      [
        {
          ingredientId: 'image-1',
          grant: {
            id: 'image-1',
            purpose: 'preview',
            state: 'READY',
            expiresAt: null,
            url: 'https://cdn.genfeed.ai/granted.png',
          },
        },
      ],
      false,
    );
    expect(JSON.stringify(authorized)).toContain('granted.png');
    expect(JSON.stringify(authorized)).not.toContain('image.png');
    expect(
      JSON.stringify(projectMediaResponse(result, [], false)),
    ).not.toContain('image.png');
  });
  it.each([
    { organizationId: 'other-org' },
    { brandId: 'other-brand' },
    { id: 'another-account' },
    { platform: 'LINKEDIN' },
    { isDeleted: true },
  ])('omits unrelated or deleted account identity %s', (change) => {
    expect(
      serializeAgentPost({
        ...post,
        credential: { ...post.credential, ...change },
      }).author,
    ).toBeUndefined();
  });
  it('retains IDs for authorized delivery when protected reads carry no raw URL', () => {
    const result = serializeAgentPost({
      ...post,
      ingredients: [{ ...post.ingredients[0], cdnUrl: null }],
    });
    expect(result.media).toEqual([
      {
        assetId: 'image-1',
        ingredientId: 'image-1',
        kind: 'image',
        order: 0,
        url: null,
      },
    ]);
  });
  it('omits cross-organization and deleted attachments and unsafe avatar URLs', () => {
    const result = serializeAgentPost({
      ...post,
      credential: { ...post.credential, externalAvatar: 'javascript:alert(1)' },
      ingredients: [
        { ...post.ingredients[0], organizationId: 'other' },
        { ...post.ingredients[0], isDeleted: true },
      ],
    });
    expect(result.media).toEqual([]);
    expect(result.author).toEqual(expect.objectContaining({ avatarUrl: null }));
  });
});
