import {
  OpenAiModerationProvider,
  toModerationScores,
} from '@api/services/moderation/providers/openai-moderation.provider';

const create = vi.hoisted(() => vi.fn());

vi.mock('openai', () => ({
  default: class {
    moderations = { create };
  },
}));

describe('toModerationScores', () => {
  it('folds vendor labels into Genfeed categories by maximum', () => {
    expect(
      toModerationScores(
        {
          category_scores: {
            harassment: 0.2,
            'harassment/threatening': 0.6,
            illicit: 0.3,
            'illicit/violent': 0.4,
            'sexual/minors': 0.01,
            'violence/graphic': 0.7,
          },
        },
        'text',
      ),
    ).toEqual({
      drugs: 0.3,
      graphic: 0.7,
      harassment: 0.6,
      sexual_minors: 0.01,
      weapons: 0.4,
    });
  });

  it('drops labels the vendor did not apply to this input type', () => {
    expect(
      toModerationScores(
        {
          category_applied_input_types: {
            hate: ['text'],
            sexual: ['text', 'image'],
          },
          category_scores: { hate: 0.9, sexual: 0.4 },
        },
        'image',
      ),
    ).toEqual({ sexual: 0.4 });
  });
});

describe('OpenAiModerationProvider', () => {
  beforeEach(() => create.mockReset());

  it('is disabled without a key and never calls out', async () => {
    const provider = new OpenAiModerationProvider(undefined);
    expect(provider.isEnabled).toBe(false);
    await expect(provider.classifyText('hello')).rejects.toThrow(
      'OPENAI_API_KEY',
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('classifies each frame in its own request', async () => {
    create.mockResolvedValue({
      results: [{ category_scores: { violence: 0.5 } }],
    });
    const provider = new OpenAiModerationProvider('key');

    await expect(
      provider.classifyFrames(['https://cdn/a.jpg', 'https://cdn/b.jpg']),
    ).resolves.toEqual([{ violence: 0.5 }, { violence: 0.5 }]);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledWith({
      input: [{ image_url: { url: 'https://cdn/a.jpg' }, type: 'image_url' }],
      model: 'omni-moderation-latest',
    });
  });

  it('chunks long text and keeps the maximum per category', async () => {
    create.mockResolvedValue({
      results: [
        { category_scores: { hate: 0.1 } },
        { category_scores: { hate: 0.8 } },
      ],
    });
    const provider = new OpenAiModerationProvider('key');

    await expect(provider.classifyText('x'.repeat(15_000))).resolves.toEqual({
      hate: 0.8,
    });
    const { input } = create.mock.calls[0][0];
    expect(input).toHaveLength(2);
    expect(typeof input[0]).toBe('string');
  });

  it('refuses a response that does not score every chunk', async () => {
    create.mockResolvedValue({
      results: [{ category_scores: { hate: 0.1 } }],
    });
    const provider = new OpenAiModerationProvider('key');

    await expect(provider.classifyText('x'.repeat(15_000))).rejects.toThrow(
      '1 results for 2 text chunks',
    );
  });
});
