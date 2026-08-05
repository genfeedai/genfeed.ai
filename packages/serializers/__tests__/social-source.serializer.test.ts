import { socialSourceAttributes } from '@serializers/attributes/social/social-source.attributes';
import { sourcePostAttributes } from '@serializers/attributes/social/source-post.attributes';
import { SocialSourceSerializer } from '@serializers/server/social/social-source.serializer';
import { SourcePostSerializer } from '@serializers/server/social/source-post.serializer';
import { describe, expect, it } from 'vitest';

type SerializedDocument = {
  data: {
    attributes: Record<string, unknown>;
    id: string;
    relationships?: Record<string, unknown>;
  };
};

describe('social source serializers canonical identity contract', () => {
  it('serializes social-source scalar ids and platform identifiers', () => {
    const output = SocialSourceSerializer.serialize({
      _id: 'legacy-source-id',
      brand: { id: 'legacy-brand' },
      brandId: 'brand-1',
      credential: { id: 'legacy-credential' },
      credentialId: 'credential-1',
      externalId: 'platform-account-1',
      handle: 'openai',
      id: 'source-1',
      lastPostExternalId: 'platform-post-1',
      organization: { id: 'legacy-organization' },
      organizationId: 'organization-1',
      user: { id: 'legacy-user' },
      userId: 'user-1',
    }) as SerializedDocument;

    expect(socialSourceAttributes).toEqual(
      expect.arrayContaining([
        'brandId',
        'credentialId',
        'externalId',
        'lastPostExternalId',
        'organizationId',
        'userId',
      ]),
    );
    expect(output.data.id).toBe('source-1');
    expect(output.data.attributes).toMatchObject({
      brandId: 'brand-1',
      credentialId: 'credential-1',
      externalId: 'platform-account-1',
      lastPostExternalId: 'platform-post-1',
      organizationId: 'organization-1',
      userId: 'user-1',
    });
    expect(output.data.attributes).not.toHaveProperty('_id');
    expect(output.data.attributes).not.toHaveProperty('brand');
    expect(output.data.attributes).not.toHaveProperty('credential');
    expect(output.data.attributes).not.toHaveProperty('organization');
    expect(output.data.attributes).not.toHaveProperty('user');
    expect(output.data.relationships).toBeUndefined();
  });

  it('serializes source-post scalar ids and platform identifiers', () => {
    const output = SourcePostSerializer.serialize({
      _id: 'legacy-source-post-id',
      authorId: 'platform-author-1',
      brand: { id: 'legacy-brand' },
      brandId: 'brand-1',
      externalId: 'platform-post-1',
      id: 'source-post-1',
      organization: { id: 'legacy-organization' },
      organizationId: 'organization-1',
      source: { id: 'legacy-source' },
      sourceId: 'source-1',
      user: { id: 'legacy-user' },
      userId: 'user-1',
    }) as SerializedDocument;

    expect(sourcePostAttributes).toEqual(
      expect.arrayContaining([
        'authorId',
        'brandId',
        'externalId',
        'organizationId',
        'sourceId',
        'userId',
      ]),
    );
    expect(output.data.id).toBe('source-post-1');
    expect(output.data.attributes).toMatchObject({
      authorId: 'platform-author-1',
      brandId: 'brand-1',
      externalId: 'platform-post-1',
      organizationId: 'organization-1',
      sourceId: 'source-1',
      userId: 'user-1',
    });
    expect(output.data.attributes).not.toHaveProperty('_id');
    expect(output.data.attributes).not.toHaveProperty('brand');
    expect(output.data.attributes).not.toHaveProperty('organization');
    expect(output.data.attributes).not.toHaveProperty('source');
    expect(output.data.attributes).not.toHaveProperty('user');
    expect(output.data.relationships).toBeUndefined();
  });
});
