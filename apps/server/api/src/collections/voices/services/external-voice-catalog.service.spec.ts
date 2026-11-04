import { ExternalVoiceCatalogService } from '@api/collections/voices/services/external-voice-catalog.service';
import type { ElevenLabsService } from '@api/services/integrations/elevenlabs/services/elevenlabs.service';
import type { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { VoiceProvider } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';

interface StoredVoice {
  externalId: string;
  externalProvider: VoiceProvider;
  id: string;
  isActive: boolean;
  name: string;
  providerData: Record<string, unknown>;
  sampleAudioUrl: string | null;
  updatedAt: Date;
}

/**
 * A tiny in-memory stand-in for the `external_voices` table, so the sync is
 * judged by the rows it leaves behind rather than by the calls it makes.
 */
function createCatalogTable(seed: StoredVoice[] = []) {
  const rows = seed.map((row) => ({ ...row }));
  let roundTrips = 0;
  const externalVoice = {
    count: vi.fn().mockResolvedValue(0),
    createMany: vi.fn(
      async ({ data }: { data: Omit<StoredVoice, 'id' | 'updatedAt'>[] }) => {
        roundTrips++;
        for (const row of data) {
          rows.push({
            ...row,
            id: `id-${row.externalId}`,
            updatedAt: new Date(0),
          });
        }
        return { count: data.length };
      },
    ),
    findMany: vi.fn(
      async ({ where }: { where: { externalProvider?: VoiceProvider } }) => {
        roundTrips++;
        return rows.filter(
          (row) =>
            !where?.externalProvider ||
            row.externalProvider === where.externalProvider,
        );
      },
    ),
    update: vi.fn(
      ({
        data,
        where,
      }: {
        data: Partial<StoredVoice>;
        where: { id: string };
      }) => {
        const row = rows.find((candidate) => candidate.id === where.id);
        Object.assign(row ?? {}, data, { updatedAt: new Date(1) });
        return row;
      },
    ),
    updateMany: vi.fn(
      async ({
        data,
        where,
      }: {
        data: Partial<StoredVoice>;
        where: {
          externalId: { notIn: string[] };
          externalProvider: VoiceProvider;
        };
      }) => {
        roundTrips++;
        const matched = rows.filter(
          (row) =>
            row.externalProvider === where.externalProvider &&
            row.isActive &&
            !where.externalId.notIn.includes(row.externalId),
        );
        for (const row of matched) {
          Object.assign(row, data);
        }
        return { count: matched.length };
      },
    ),
  };
  return {
    prisma: {
      $transaction: vi.fn(async (operations: unknown[]) => {
        roundTrips++;
        return operations;
      }),
      externalVoice,
    },
    roundTrips: () => roundTrips,
    rows,
  };
}

function storedVoice(overrides: Partial<StoredVoice>): StoredVoice {
  return {
    externalId: 'v1',
    externalProvider: VoiceProvider.HEYGEN,
    id: 'row-v1',
    isActive: true,
    name: 'Ava',
    providerData: { gender: 'female', index: 0 },
    sampleAudioUrl: null,
    updatedAt: new Date(0),
    ...overrides,
  };
}

describe('ExternalVoiceCatalogService.syncFromProviders', () => {
  let table: ReturnType<typeof createCatalogTable>;
  let elevenLabs: { getVoices: ReturnType<typeof vi.fn> };
  let heygen: { getVoices: ReturnType<typeof vi.fn> };

  function createService(seed: StoredVoice[] = []) {
    table = createCatalogTable(seed);
    elevenLabs = { getVoices: vi.fn().mockResolvedValue([]) };
    heygen = { getVoices: vi.fn().mockResolvedValue([]) };
    return new ExternalVoiceCatalogService(
      table.prisma as unknown as PrismaService,
      { log: vi.fn() } as unknown as LoggerService,
      elevenLabs as unknown as ElevenLabsService,
      heygen as unknown as HeyGenService,
    );
  }

  it('inserts new voices and refreshes only the ones that changed', async () => {
    const service = createService([
      storedVoice({ externalId: 'v1', id: 'row-v1', name: 'Ava' }),
      storedVoice({
        externalId: 'v2',
        id: 'row-v2',
        name: 'Ben',
        providerData: { gender: 'male', index: 1 },
      }),
    ]);
    heygen.getVoices.mockResolvedValue([
      { gender: 'female', index: 0, name: 'Ava', preview: '', voiceId: 'v1' },
      {
        gender: 'male',
        index: 1,
        name: 'Benjamin',
        preview: '',
        voiceId: 'v2',
      },
      {
        gender: 'female',
        index: 2,
        name: 'Cleo',
        preview: 'c.mp3',
        voiceId: 'v3',
      },
    ]);

    const result = await service.syncFromProviders([VoiceProvider.HEYGEN]);

    expect(result).toEqual({ created: 1, total: 3, updated: 1 });
    expect(
      table.rows.map(({ externalId, name, sampleAudioUrl, updatedAt }) => ({
        externalId,
        name,
        sampleAudioUrl,
        updatedAt,
      })),
    ).toEqual([
      {
        externalId: 'v1',
        name: 'Ava',
        sampleAudioUrl: null,
        updatedAt: new Date(0),
      },
      {
        externalId: 'v2',
        name: 'Benjamin',
        sampleAudioUrl: null,
        updatedAt: new Date(1),
      },
      {
        externalId: 'v3',
        name: 'Cleo',
        sampleAudioUrl: 'c.mp3',
        updatedAt: new Date(0),
      },
    ]);
  });

  it('treats a reordered HeyGen voice as changed provider data', async () => {
    const service = createService([
      storedVoice({ providerData: { index: 4, gender: 'female' } }),
    ]);
    heygen.getVoices.mockResolvedValue([
      { gender: 'female', index: 0, name: 'Ava', preview: '', voiceId: 'v1' },
    ]);

    const result = await service.syncFromProviders([VoiceProvider.HEYGEN]);

    expect(result).toEqual({ created: 0, total: 1, updated: 1 });
    expect(table.rows[0].providerData).toEqual({ gender: 'female', index: 0 });
  });

  it('leaves ElevenLabs provider data alone when only the preview changed', async () => {
    const service = createService([
      storedVoice({
        externalId: 'el1',
        externalProvider: VoiceProvider.ELEVENLABS,
        id: 'row-el1',
        name: 'Rachel',
        providerData: { curated: 'yes' },
        sampleAudioUrl: 'old.mp3',
      }),
    ]);
    elevenLabs.getVoices.mockResolvedValue([
      { name: 'Rachel', preview: 'new.mp3', voiceId: 'el1' },
    ]);

    const result = await service.syncFromProviders([VoiceProvider.ELEVENLABS]);

    expect(result).toEqual({ created: 0, total: 1, updated: 1 });
    expect(table.rows[0]).toMatchObject({
      providerData: { curated: 'yes' },
      sampleAudioUrl: 'new.mp3',
    });
  });

  it('writes a large unchanged catalog in a handful of round trips', async () => {
    const voices = Array.from({ length: 3000 }, (_, index) => ({
      gender: 'female',
      index,
      name: `Voice ${index}`,
      preview: '',
      voiceId: `v${index}`,
    }));
    const service = createService();
    heygen.getVoices.mockResolvedValue(voices);

    const first = await service.syncFromProviders([VoiceProvider.HEYGEN]);
    const firstRoundTrips = table.roundTrips();
    const second = await service.syncFromProviders([VoiceProvider.HEYGEN]);

    expect(first).toEqual({ created: 3000, total: 3000, updated: 0 });
    expect(second).toEqual({ created: 0, total: 3000, updated: 0 });
    expect(firstRoundTrips).toBe(8);
    expect(table.roundTrips() - firstRoundTrips).toBe(2);
  });

  it('deactivates HeyGen voices missing from the fetched catalog', async () => {
    const service = createService([
      storedVoice({ externalId: 'v1', id: 'row-v1' }),
      storedVoice({ externalId: 'gone', id: 'row-gone', name: 'Gone' }),
    ]);
    heygen.getVoices.mockResolvedValue([
      { gender: 'female', index: 0, name: 'Ava', preview: '', voiceId: 'v1' },
    ]);

    await service.syncFromProviders([VoiceProvider.HEYGEN]);

    expect(
      table.rows.map(({ externalId, isActive }) => ({ externalId, isActive })),
    ).toEqual([
      { externalId: 'v1', isActive: true },
      { externalId: 'gone', isActive: false },
    ]);
  });

  it('keeps the existing catalog when HeyGen returns no voices', async () => {
    const service = createService([storedVoice({ externalId: 'v1' })]);

    const result = await service.syncFromProviders([VoiceProvider.HEYGEN]);

    expect(result).toEqual({ created: 0, total: 0, updated: 0 });
    expect(table.rows[0].isActive).toBe(true);
  });
});

describe('ExternalVoiceCatalogService.findRange', () => {
  let prisma: {
    externalVoice: {
      count: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
  };
  let service: ExternalVoiceCatalogService;

  beforeEach(() => {
    prisma = {
      externalVoice: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    service = new ExternalVoiceCatalogService(
      prisma as unknown as PrismaService,
      { log: vi.fn() } as unknown as LoggerService,
      { getVoices: vi.fn() } as unknown as ElevenLabsService,
      { getVoices: vi.fn() } as unknown as HeyGenService,
    );
  });

  it('reads one page from the database with a matching count', async () => {
    prisma.externalVoice.findMany.mockResolvedValue([{ id: 'v1' }]);
    prisma.externalVoice.count.mockResolvedValue(250);

    const range = await service.findRange({
      providers: [VoiceProvider.ELEVENLABS],
      search: 'ali',
      skip: 200,
      take: 100,
    });

    const where = {
      externalProvider: { in: [VoiceProvider.ELEVENLABS] },
      isActive: true,
      name: { contains: 'ali', mode: 'insensitive' },
    };
    expect(prisma.externalVoice.findMany).toHaveBeenCalledWith({
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: 200,
      take: 100,
      where,
    });
    expect(prisma.externalVoice.count).toHaveBeenCalledWith({ where });
    expect(range).toEqual({ docs: [{ id: 'v1' }], totalDocs: 250 });
  });

  it('lists deactivated entries when the admin view asks for them', async () => {
    await service.findRange({ includeInactive: true, skip: 0, take: 15 });

    expect(prisma.externalVoice.findMany).toHaveBeenCalledWith({
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: 0,
      take: 15,
      where: {},
    });
  });
});
