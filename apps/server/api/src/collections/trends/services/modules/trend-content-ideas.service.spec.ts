import type { TrendEntity } from '@api/collections/trends/entities/trend.entity';
import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import { calculateEstimatedTextCredits } from '@api/helpers/utils/text-pricing/text-pricing.util';
import { LlmStructuredOutputError } from '@api/services/integrations/llm/llm-structured-output.error';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { TrendContentIdeasService } from './trend-content-ideas.service';

const trend = (platform = 'tiktok') =>
  ({ platform, topic: '<topic>', viralityScore: 80 }) as TrendEntity;
const idea = {
  title: ' Title ',
  description: 'Description',
  contentType: 'video',
  estimatedViews: 100,
  hashtags: null,
  caption: null,
};
const valid = JSON.stringify({ ideas: [idea] });
describe('TrendContentIdeasService structured adapter', () => {
  let service: TrendContentIdeasService;
  let completion: ReturnType<typeof vi.fn>;
  let findOne: ReturnType<typeof vi.fn>;
  const pricing = {
    pricingType: 'per-token',
    inputCostPerMillionTokens: 1000000,
    outputCostPerMillionTokens: 1000000,
  };
  beforeEach(() => {
    // Real structured adapter/helper; only the underlying provider completion is mocked.
    const replicate = Object.create(
      ReplicateService.prototype,
    ) as ReplicateService;
    completion = vi.fn().mockResolvedValue(valid);
    replicate.generateTextCompletionSync = completion;
    findOne = vi.fn().mockResolvedValue(pricing);
    service = new TrendContentIdeasService(
      { warn: vi.fn() } as never,
      { findOne } as never,
      replicate,
    );
  });
  it('validates one completion, maps trusted platform and omits nullish properties', async () => {
    const billing = vi.fn();
    expect(
      await service.generateIdeasForPlatform('tiktok', [trend()], 1, billing),
    ).toEqual([
      {
        title: 'Title',
        description: 'Description',
        contentType: 'video',
        platform: 'tiktok',
        estimatedViews: 100,
      },
    ]);
    expect(completion).toHaveBeenCalledTimes(1);
    expect(billing).toHaveBeenCalledExactlyOnceWith(
      calculateEstimatedTextCredits(
        pricing,
        completion.mock.calls[0][1],
        valid,
      ),
    );
  });
  it('accounts each returned completion using its actual repair input and preserves model/BYOK', async () => {
    const invalid = JSON.stringify({
      ideas: [{ ...idea, estimatedViews: '10K-50K' }],
    });
    completion.mockResolvedValueOnce(invalid).mockResolvedValueOnce(valid);
    const billing = vi.fn();
    await service.generateIdeasForPlatform(
      'tiktok',
      [trend()],
      1,
      billing,
      { label: '<brand>', text: '<voice>' },
      'org-key',
    );
    expect(completion).toHaveBeenCalledTimes(2);
    expect(billing.mock.calls).toEqual([
      [
        calculateEstimatedTextCredits(
          pricing,
          completion.mock.calls[0][1],
          invalid,
        ),
      ],
      [
        calculateEstimatedTextCredits(
          pricing,
          completion.mock.calls[1][1],
          valid,
        ),
      ],
    ]);
    for (const [model, input, key] of completion.mock.calls) {
      expect(model).toBe(DEFAULT_TEXT_MODEL);
      expect(key).toBe('org-key');
      expect(input.max_completion_tokens).toBe(2000);
      expect(input.prompt).toContain('brand');
      expect(input.prompt).not.toContain('<brand>');
    }
    expect(completion.mock.calls[1][1].prompt.length).toBeGreaterThan(
      completion.mock.calls[0][1].prompt.length,
    );
    expect(completion.mock.calls[1][1].prompt).toContain('estimatedViews');
  });
  it('accounts twice then rejects two invalid completions', async () => {
    completion.mockResolvedValue('{}');
    const billing = vi.fn();
    await expect(
      service.generateContentIdeas([trend()], 1, billing),
    ).rejects.toBeInstanceOf(LlmStructuredOutputError);
    expect(completion).toHaveBeenCalledTimes(2);
    expect(billing).toHaveBeenCalledTimes(2);
  });
  it('does not look up pricing without billing callback', async () => {
    await service.generateContentIdeas([trend()], 1);
    expect(findOne).not.toHaveBeenCalled();
  });
  it.each(['transport', 'pricing', 'callback'])(
    'propagates %s failure without another generation',
    async (kind) => {
      const error = new Error(kind);
      const billing = vi.fn();
      if (kind === 'transport') completion.mockRejectedValue(error);
      if (kind === 'pricing') findOne.mockRejectedValue(error);
      if (kind === 'callback')
        billing.mockImplementation(() => {
          throw error;
        });
      await expect(
        service.generateContentIdeas([trend()], 1, billing),
      ).rejects.toBe(error);
      expect(completion).toHaveBeenCalledTimes(1);
    },
  );
  it('never returns a partial map when a later platform fails', async () => {
    const error = new Error('later platform');
    completion.mockResolvedValueOnce(valid).mockRejectedValueOnce(error);
    await expect(
      service.generateContentIdeas([trend(), trend('youtube')], 2),
    ).rejects.toBe(error);
    expect(completion).toHaveBeenCalledTimes(2);
  });
  it('returns valid empty ideas and does not call provider on empty input', async () => {
    expect(await service.generateContentIdeas([])).toEqual(new Map());
    expect(completion).not.toHaveBeenCalled();
    completion.mockResolvedValue('{"ideas":[]}');
    expect(await service.generateContentIdeas([trend()])).toEqual(
      new Map([['tiktok', []]]),
    );
  });
  it('retains prompt sanitization and count slicing', async () => {
    expect(service.sanitizeForPrompt('<x>')).toBe('x');
    expect(service.sanitizeForPrompt('x'.repeat(2100))).toHaveLength(2000);
    completion.mockResolvedValue(JSON.stringify({ ideas: [idea, idea] }));
    expect(
      await service.generateIdeasForPlatform('tiktok', [trend()], 1),
    ).toHaveLength(1);
  });
});
