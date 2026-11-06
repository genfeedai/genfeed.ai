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

type TaskRow = {
  brandId: string;
  ingredientId: string;
  inputMetadata: { intentHash?: string };
  isDeleted: boolean;
  organizationId: string;
  outputIndex: number;
  quoteId: string;
  userId: string;
};

function fixture() {
  const tasksTable: TaskRow[] = [];
  const cacheLog: unknown[][] = [];
  const providerWork: string[] = [];
  const characterChecks: unknown[] = [];
  const authorizedIngredients = { count: 4 };
  const input = {
    normalize: vi.fn().mockReturnValue(intent),
    prepare: vi.fn(async () => {
      providerWork.push('prepare');
    }),
  };
  const quote = {
    quote: vi.fn(async () => {
      providerWork.push('quote');
    }),
  };
  const cache = {
    get: vi.fn(async (key: string): Promise<{ intentHash: string } | null> => {
      cacheLog.push(['get', key]);
      return null;
    }),
    set: vi.fn(async (key: string) => {
      cacheLog.push(['set', key]);
    }),
    getdel: vi.fn(async (key: string) => {
      cacheLog.push(['getdel', key]);
      return null;
    }),
  };
  const tasks = { resolveCredential: vi.fn() };
  const models = {
    findOne: vi.fn(async () => {
      providerWork.push('model');
      return null;
    }),
  };
  const prisma = {
    crunGenerationTask: {
      findMany: vi.fn(async ({ where }: { where: Partial<TaskRow> }) =>
        tasksTable
          .filter((row) =>
            Object.entries(where).every(
              ([key, value]) => row[key as keyof TaskRow] === value,
            ),
          )
          .sort((a, b) => a.outputIndex - b.outputIndex),
      ),
    },
    ingredient: { count: vi.fn(async () => authorizedIngredients.count) },
  };
  const config = { get: vi.fn() };
  const revokedReferences = new Set<string>();
  const personas = {
    resolveCharacterReferences: vi.fn(
      async (request: { ingredientIds: string[] }) => {
        characterChecks.push(request);
        if (request.ingredientIds.some((id) => revokedReferences.has(id)))
          throw new NotFoundException('Reference image');
      },
    ),
  };
  const service = new CrunPreviewQuoteService(
    input as never,
    quote as never,
    cache as never,
    tasks as never,
    models as never,
    prisma as never,
    config as never,
    personas as never,
  );
  return {
    authorizedIngredients,
    cache,
    cacheLog,
    characterChecks,
    providerWork,
    revokedReferences,
    service,
    tasksTable,
  };
}

function rows(
  hash: string | undefined = quoteSnapshotHash(intent),
  owner: Partial<TaskRow> = {},
): TaskRow[] {
  return Array.from({ length: 4 }, (_, outputIndex) => ({
    brandId: 'brand',
    ingredientId: `ingredient-${outputIndex}`,
    inputMetadata: { intentHash: hash },
    isDeleted: false,
    organizationId: 'org',
    outputIndex,
    quoteId: 'quote',
    userId: 'user',
    ...owner,
  }));
}

describe('Crun frozen quote consumption', () => {
  it('replays every ordered owned output after Redis expiry without admission/provider work', async () => {
    const f = fixture();
    f.tasksTable.push(...rows().reverse());
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
    expect(f.cacheLog).toEqual([]);
    expect(f.providerWork).toEqual([]);
  });

  it.each([
    ['another user', { userId: 'someone-else' }],
    ['another brand', { brandId: 'other-brand' }],
    ['another organization', { organizationId: 'other-org' }],
    ['deleted rows', { isDeleted: true }],
  ])('never replays outputs owned by %s', async (_label, owner) => {
    const f = fixture();
    f.tasksTable.push(...rows(quoteSnapshotHash(intent), owner));

    await expect(
      f.service.consume(intent, 'quote', user as never),
    ).rejects.toMatchObject({ response: { code: 'CRUN_QUOTE_STALE' } });
  });

  it.each(['different', undefined])(
    'denies mismatching or legacy absent durable intent hash: %s',
    async (hash) => {
      const f = fixture();
      const records = rows();
      records[0].inputMetadata.intentHash = hash;
      f.tasksTable.push(...records);
      await expect(
        f.service.consume(intent, 'quote', user as never),
      ).rejects.toMatchObject({ response: { code: 'CRUN_QUOTE_STALE' } });
      expect(f.cacheLog).toEqual([]);
    },
  );

  it('returns in-progress for partial durable rows rather than consuming again', async () => {
    const f = fixture();
    f.tasksTable.push(...rows().slice(0, 3));
    await expect(
      f.service.consume(intent, 'quote', user as never),
    ).rejects.toMatchObject({ response: { code: 'CRUN_QUOTE_IN_PROGRESS' } });
    expect(f.cacheLog).not.toContainEqual(['getdel', expect.any(String)]);
  });

  it('denies replay when an output is no longer authorized', async () => {
    const f = fixture();
    f.tasksTable.push(...rows());
    f.authorizedIngredients.count = 3;
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
    expect(f.cacheLog).not.toContainEqual(['getdel', expect.any(String)]);
  });
});

describe('Crun quote character admission on consume (#6040)', () => {
  const captured = {
    brandId: 'brand',
    intent: { ...intent, references: ['avatar-1'] },
    organizationId: 'org',
    snapshot: { providerQuote: {} },
  };

  it('re-admits the quoted characters and refuses once access was revoked', async () => {
    const f = fixture();
    f.revokedReferences.add('avatar-1');

    await expect(
      f.service.assertCurrent(captured as never),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(f.characterChecks).toEqual([
      {
        brandId: 'brand',
        ingredientIds: ['avatar-1'],
        organizationId: 'org',
        path: 'image',
      },
    ]);
    expect(f.providerWork).toEqual([]);
  });
});
