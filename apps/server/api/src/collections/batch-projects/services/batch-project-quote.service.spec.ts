import { BatchProjectQuoteService } from '@api/collections/batch-projects/services/batch-project-quote.service';
import { ByokProvider, ModelCategory } from '@genfeedai/contracts';
import {
  AVATAR_GENERATION_CREDIT_COST,
  MODEL_KEYS,
} from '@genfeedai/contracts/constants';
import { ConflictException } from '@nestjs/common';

function ideaItem(id: string, format: string) {
  return {
    id,
    idea: {
      caption: 'Caption',
      format,
      hook: 'Hook',
      id: `idea-${id}`,
      platformHints: [],
      visualPrompt: `Prompt ${id}`,
    },
  };
}

describe('BatchProjectQuoteService', () => {
  const estimate = { estimate: vi.fn() };
  const models = { validateModelForOrg: vi.fn() };
  const byok = { isByokActiveForProvider: vi.fn() };
  const service = new BatchProjectQuoteService(
    estimate as never,
    models as never,
    byok as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    estimate.estimate.mockImplementation(async ({ category }) => ({
      credits: category === ModelCategory.VIDEO ? 20 : 4,
      isAvailable: true,
      modelKey:
        category === ModelCategory.VIDEO ? 'model-video' : 'model-image',
    }));
    models.validateModelForOrg.mockResolvedValue({ provider: 'replicate' });
    byok.isByokActiveForProvider.mockResolvedValue(false);
  });

  it('prices each idea with the model and price its generation will use', async () => {
    const quote = await service.build({
      items: [
        { attempt: 1, item: ideaItem('item-1', 'image') as never },
        { attempt: 1, item: ideaItem('item-2', 'image') as never },
        { attempt: 2, item: ideaItem('item-3', 'video') as never },
        { attempt: 1, item: ideaItem('item-4', 'avatar') as never },
      ],
      organizationId: 'org-1',
      revision: 7,
    });

    expect(quote).toMatchObject({
      revision: 7,
      total: 4 + 4 + 20 + AVATAR_GENERATION_CREDIT_COST,
    });
    expect(quote.items).toEqual([
      expect.objectContaining({
        billingMode: 'platform',
        credits: 4,
        key: 'batch-project-item:item-1:dispatch:1',
        model: 'model-image',
      }),
      expect.objectContaining({ credits: 4, itemId: 'item-2' }),
      expect.objectContaining({
        credits: 20,
        key: 'batch-project-item:item-3:dispatch:2',
        model: 'model-video',
      }),
      expect.objectContaining({
        credits: AVATAR_GENERATION_CREDIT_COST,
        model: MODEL_KEYS.HEYGEN_AVATAR,
      }),
    ]);
    // One estimate per format, not per idea.
    expect(estimate.estimate).toHaveBeenCalledTimes(2);
    expect(estimate.estimate).toHaveBeenCalledWith(
      expect.objectContaining({
        aspectRatio: '9:16',
        category: ModelCategory.IMAGE,
        organizationId: 'org-1',
        outputs: 1,
      }),
    );
  });

  it('quotes zero platform credits for formats paid with the org key', async () => {
    byok.isByokActiveForProvider.mockImplementation(
      async (_organizationId: string, provider: ByokProvider) =>
        provider === ByokProvider.HEYGEN || provider === ByokProvider.REPLICATE,
    );

    const quote = await service.build({
      items: [
        { attempt: 1, item: ideaItem('item-1', 'image') as never },
        { attempt: 1, item: ideaItem('item-2', 'avatar') as never },
      ],
      organizationId: 'org-1',
      revision: 1,
    });

    expect(quote.total).toBe(0);
    expect(quote.items.map((line) => [line.billingMode, line.credits])).toEqual(
      [
        ['byok', 0],
        ['byok', 0],
      ],
    );
  });

  it('refuses to quote a format without an available priced model', async () => {
    estimate.estimate.mockResolvedValue({
      credits: null,
      isAvailable: false,
      modelKey: null,
    });

    await expect(
      service.build({
        items: [{ attempt: 1, item: ideaItem('item-1', 'image') as never }],
        organizationId: 'org-1',
        revision: 1,
      }),
    ).rejects.toThrow(ConflictException);
  });
});
