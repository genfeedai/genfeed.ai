import {
  buildArtifactContentDigest,
  buildArtifactVersionPinIdempotencyKey,
  normalizeArtifactForSerializer,
  projectPostArtifactMaterial,
} from './agent-artifact-material.util';

describe('agent artifact material', () => {
  it('builds the same versioned digest for equivalent nested key orders', () => {
    const first = buildArtifactContentDigest({
      a: 1,
      b: { y: 2, z: 3 },
    });
    const second = buildArtifactContentDigest({
      b: { z: 3, y: 2 },
      a: 1,
    });

    expect(first).toBe(
      'sha256:v1:76ccbab6ef55bd2a6cefeb6799798f9ba077e9be24aed4b35eb7f0ea0b4be490',
    );
    expect(second).toBe(first);
  });

  it('changes the digest when canonical material changes', () => {
    expect(buildArtifactContentDigest({ content: 'approved' })).not.toBe(
      buildArtifactContentDigest({ content: 'edited' }),
    );
  });

  it('keeps the article serializer banner alias and leaves other kinds direct', () => {
    const article = {
      coverImageUrl: 'https://cdn.example/cover.png',
      id: 'article-1',
    };
    const post = { id: 'post-1' };

    expect(normalizeArtifactForSerializer('article', article)).toEqual({
      ...article,
      bannerUrl: article.coverImageUrl,
    });
    expect(normalizeArtifactForSerializer('post', post)).toBe(post);
  });

  it('projects allowlisted post material with deterministic ingredient order', () => {
    const material = projectPostArtifactMaterial({
      description: 'Approved copy',
      id: 'post-1',
      ingredients: [
        { cdnUrl: 'https://cdn.example/b.png', id: 'ingredient-b' },
        {
          cdnUrl: 'https://cdn.example/a.png',
          id: 'ingredient-a',
          internalOnly: true,
        },
      ],
      internalOnly: true,
    });

    expect(material).toMatchObject({
      description: 'Approved copy',
      id: 'post-1',
      ingredients: [
        { cdnUrl: 'https://cdn.example/a.png', id: 'ingredient-a' },
        { cdnUrl: 'https://cdn.example/b.png', id: 'ingredient-b' },
      ],
    });
    expect(material).not.toHaveProperty('internalOnly');
    expect(material.ingredients).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ internalOnly: true })]),
    );
  });

  it('preserves the version-pin identity ordering and prefix', () => {
    expect(
      buildArtifactVersionPinIdempotencyKey(
        {
          brandId: 'brand-1',
          kind: 'post',
          organizationId: 'org-1',
          recordId: 'post-1',
        },
        'sha256:v1:76ccbab6ef55bd2a6cefeb6799798f9ba077e9be24aed4b35eb7f0ea0b4be490',
      ),
    ).toBe(
      'content-version-pin:v1:69aed3215daaa31d09850332b034436017547f00cc47652ede249492f1fa5c17',
    );
  });
});
