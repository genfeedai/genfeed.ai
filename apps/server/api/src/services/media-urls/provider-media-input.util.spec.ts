import {
  authorizeProviderMediaInput,
  type ProviderMediaAuthorizer,
} from '@api/services/media-urls/provider-media-input.util';

const ORIGINS = [
  'https://cdn.genfeed.ai',
  'https://cdn.genfeed.ai/ingredients',
];
const CANONICAL = 'https://cdn.genfeed.ai/ingredients/images/image-1';

function authorizer(
  issued: Record<string, string> = {
    'image-1': 'https://cdn.genfeed.ai/signed/image-1?Signature=a',
    'video-1': 'https://cdn.genfeed.ai/signed/video-1?Signature=b',
  },
) {
  const issue = vi.fn(
    async (ids: readonly string[]) =>
      new Map(
        ids.flatMap((id) => (issued[id] ? [[id, issued[id]]] : [])),
      ) as ReadonlyMap<string, string>,
  );
  const value: ProviderMediaAuthorizer = { issue, origins: ORIGINS };
  return { issue, value };
}

describe('authorizeProviderMediaInput', () => {
  it('replaces canonical internal URLs anywhere in the input, once per id', async () => {
    const { issue, value } = authorizer();
    const input = {
      image: CANONICAL,
      prompt: 'a calm sea',
      references: [
        CANONICAL,
        'https://cdn.genfeed.ai/ingredients/videos/video-1',
      ],
      nested: { frame: `${CANONICAL}?cache=1`, seed: 7 },
    };

    const result = await authorizeProviderMediaInput(input, value);

    expect(result).toEqual({
      image: 'https://cdn.genfeed.ai/signed/image-1?Signature=a',
      prompt: 'a calm sea',
      references: [
        'https://cdn.genfeed.ai/signed/image-1?Signature=a',
        'https://cdn.genfeed.ai/signed/video-1?Signature=b',
      ],
      nested: {
        frame: 'https://cdn.genfeed.ai/signed/image-1?Signature=a',
        seed: 7,
      },
    });
    expect(issue).toHaveBeenCalledTimes(1);
    expect(issue).toHaveBeenCalledWith(['image-1', 'video-1']);
    expect(input.image).toBe(CANONICAL);
  });

  it('leaves external URLs, free text and inputs without internal media alone', async () => {
    const { issue, value } = authorizer();
    const input = {
      image: 'https://example.com/images/image-1',
      prompt: '/images/cat are great',
      count: 2,
    };
    await expect(authorizeProviderMediaInput(input, value)).resolves.toBe(
      input,
    );
    expect(issue).not.toHaveBeenCalled();
  });

  it('fails closed when an id is not authorized', async () => {
    const { value } = authorizer({});
    await expect(
      authorizeProviderMediaInput({ image: CANONICAL }, value),
    ).rejects.toThrow('was not authorized');
  });

  it('fails closed when the issuer rejects', async () => {
    const value: ProviderMediaAuthorizer = {
      issue: vi.fn().mockRejectedValue(new Error('foreign media')),
      origins: ORIGINS,
    };
    await expect(
      authorizeProviderMediaInput({ image: CANONICAL }, value),
    ).rejects.toThrow('foreign media');
  });

  it.each([
    'https://cdn.genfeed.ai/ingredients/thumbnails/video-1',
    'https://cdn.genfeed.ai/ingredients/%74humbnails/video-1',
    'https://cdn.genfeed.ai/ingredients/not-media/asset-1',
    'https://cdn.genfeed.ai/references/asset-1',
  ])('never passes the unsigned internal URL %s through', async (url) => {
    const { issue, value } = authorizer();
    await expect(
      authorizeProviderMediaInput({ image: url }, value),
    ).rejects.toThrow('no authorized equivalent');
    expect(issue).not.toHaveBeenCalled();
  });
});
