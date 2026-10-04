import { NotFoundException } from '@api/exceptions/not-found.exception';
import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';
import { CrunPreviewQuoteService } from '@api/services/integrations/crun/crun-preview-quote.service';

const user = { userId: 'user', organizationId: 'org', brandId: 'brand' };
const intent = {
  model: 'crun/google/nano-banana-pro',
  text: 'Bird',
  brandId: 'brand',
  outputs: 4,
};
function fixture() {
  const input = {
    normalize: vi.fn().mockReturnValue(intent),
    prepare: vi.fn(),
  };
  const quote = { quote: vi.fn() };
  const cache = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn(),
    getdel: vi.fn(),
  };
  const tasks = {
    isAdmissionEnabled: vi.fn().mockReturnValue(false),
    resolveCredential: vi.fn(),
  };
  const models = { findOne: vi.fn() };
  const prisma = {
    crunGenerationTask: { findMany: vi.fn().mockResolvedValue([]) },
    ingredient: { count: vi.fn().mockResolvedValue(4) },
  };
  const config = { get: vi.fn() };
  const personas = {
    resolveCharacterReferences: vi.fn().mockResolvedValue(undefined),
  };
  const service = new CrunPreviewQuoteService(
    input as never,
    quote as never,
    cache as never,
    tasks as never,
    models as never,
    prisma as never,
    config as never,
    personas,
  );
  return { personas, service, input, quote, cache, tasks, models, prisma };
}
function rows(hash = quoteSnapshotHash(intent)) {
  return Array.from({ length: 4 }, (_, outputIndex) => ({
    ingredientId: `ingredient-${outputIndex}`,
    outputIndex,
    inputMetadata: { intentHash: hash },
  }));
}
describe('Crun frozen quote consumption', () => {
  it('replays every ordered owned output after Redis expiry without admission/provider work', async () => {
    const f = fixture();
    f.prisma.crunGenerationTask.findMany.mockResolvedValue(rows());
    await expect(
      f.service.consume(intent, 'quote', user as never),
    ).resolves.toEqual({
      kind: 'replay',
      ingredientIds: [
        'ingredient-0',
        'ingredient-1',
        'ingredient-2',
        'ingredient-3',
      ],
    });
    expect(f.cache.get).not.toHaveBeenCalled();
    expect(f.tasks.isAdmissionEnabled).not.toHaveBeenCalled();
    expect(f.input.prepare).not.toHaveBeenCalled();
    expect(f.quote.quote).not.toHaveBeenCalled();
    expect(f.prisma.crunGenerationTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org',
          userId: 'user',
          brandId: 'brand',
          quoteId: 'quote',
          isDeleted: false,
        },
      }),
    );
  });
  it.each(['different', undefined])(
    'denies mismatching or legacy absent durable intent hash: %s',
    async (hash) => {
      const f = fixture();
      const records = rows();
      records[0].inputMetadata.intentHash = hash as string;
      f.prisma.crunGenerationTask.findMany.mockResolvedValue(records);
      await expect(
        f.service.consume(intent, 'quote', user as never),
      ).rejects.toMatchObject({ response: { code: 'CRUN_QUOTE_STALE' } });
      expect(f.cache.get).not.toHaveBeenCalled();
    },
  );
  it('returns in-progress for partial durable rows rather than consuming again', async () => {
    const f = fixture();
    f.prisma.crunGenerationTask.findMany.mockResolvedValue(rows().slice(0, 3));
    await expect(
      f.service.consume(intent, 'quote', user as never),
    ).rejects.toMatchObject({ response: { code: 'CRUN_QUOTE_IN_PROGRESS' } });
    expect(f.cache.getdel).not.toHaveBeenCalled();
  });
  it('denies replay when an output is no longer authorized', async () => {
    const f = fixture();
    f.prisma.crunGenerationTask.findMany.mockResolvedValue(rows());
    f.prisma.ingredient.count.mockResolvedValue(3);
    await expect(
      f.service.consume(intent, 'quote', user as never),
    ).rejects.toMatchObject({ response: { code: 'CRUN_QUOTE_STALE' } });
  });
  it('distinguishes a consumed token without durable rows from an expired token', async () => {
    const f = fixture();
    f.cache.get
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ intentHash: quoteSnapshotHash(intent) });
    await expect(
      f.service.consume(intent, 'quote', user as never),
    ).rejects.toMatchObject({ response: { code: 'CRUN_QUOTE_IN_PROGRESS' } });
    await expect(
      f.service.consume(intent, 'quote', user as never),
    ).rejects.toMatchObject({ response: { code: 'CRUN_QUOTE_STALE' } });
    expect(f.cache.getdel).not.toHaveBeenCalled();
  });
});

describe('Crun quote character admission on consume (#6040)', () => {
  it('re-admits the quoted characters and refuses once access was revoked', async () => {
    const f = fixture();
    f.tasks.isAdmissionEnabled.mockReturnValue(true);
    f.personas.resolveCharacterReferences.mockRejectedValue(
      new NotFoundException('Reference image'),
    );
    const captured = {
      brandId: 'brand',
      intent: { ...intent, references: ['avatar-1'] },
      organizationId: 'org',
      snapshot: { providerQuote: {} },
    };

    await expect(
      f.service.assertCurrent(captured as never),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(f.personas.resolveCharacterReferences).toHaveBeenCalledWith({
      brandId: 'brand',
      ingredientIds: ['avatar-1'],
      organizationId: 'org',
      path: 'image',
    });
    expect(f.models.findOne).not.toHaveBeenCalled();
  });
});
