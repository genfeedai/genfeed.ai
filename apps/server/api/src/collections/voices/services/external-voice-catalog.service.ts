import { ElevenLabsService } from '@api/services/integrations/elevenlabs/services/elevenlabs.service';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ExternalVoice, type Prisma, VoiceProvider } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

export interface ExternalVoiceFindAllOptions {
  provider?: VoiceProvider;
  /** Several providers at once; takes precedence over `provider`. */
  providers?: VoiceProvider[];
  search?: string;
  isActive?: boolean;
  /** Admin view: list deactivated entries too. Ignored when `isActive` is set. */
  includeInactive?: boolean;
}

export interface ExternalVoiceFindRangeOptions
  extends ExternalVoiceFindAllOptions {
  skip: number;
  take: number;
  orderBy?: Prisma.ExternalVoiceOrderByWithRelationInput[];
}

export interface ExternalVoiceRange {
  docs: ExternalVoice[];
  totalDocs: number;
}

export interface ExternalVoicePatchDto {
  isActive?: boolean;
  isDefaultSelectable?: boolean;
  isFeatured?: boolean;
}

export interface SyncResult {
  created: number;
  updated: number;
  total: number;
}

/**
 * Providers that expose a remote catalog we can sync from.
 *
 * Prisma 7 generates `VoiceProvider` as a const object + union type rather than
 * a TS `enum`, so its members are only usable as values. `typeof X.MEMBER`
 * recovers the literal type for use in type positions.
 */
type SyncableProvider =
  | typeof VoiceProvider.ELEVENLABS
  | typeof VoiceProvider.HEYGEN;

/**
 * Service managing the ExternalVoice provider catalog.
 * Catalog entries are reference data synced from ElevenLabs/HeyGen — they are
 * NOT user-owned assets and carry no brand/org/isDeleted scope.
 */
@Traced()
@Injectable()
export class ExternalVoiceCatalogService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly loggerService: LoggerService,
    private readonly elevenLabsService: ElevenLabsService,
    private readonly heygenService: HeyGenService,
  ) {}

  findAll(options: ExternalVoiceFindAllOptions = {}): Promise<ExternalVoice[]> {
    return this.prisma.externalVoice.findMany({
      orderBy: [{ name: 'asc' }],
      where: this.buildWhere(options),
    });
  }

  /**
   * A slice of the catalog, cut in the database. The library picker walks the
   * whole catalog page by page, so reading every row to slice a page in
   * memory made each request cost the full catalog.
   */
  async findRange(
    options: ExternalVoiceFindRangeOptions,
  ): Promise<ExternalVoiceRange> {
    const {
      orderBy = [{ name: 'asc' }, { id: 'asc' }],
      skip,
      take,
      ...filters
    } = options;
    const where = this.buildWhere(filters);
    const [docs, totalDocs] = await Promise.all([
      this.prisma.externalVoice.findMany({
        orderBy,
        skip,
        take,
        where,
      }),
      this.prisma.externalVoice.count({ where }),
    ]);

    return { docs, totalDocs };
  }

  private buildWhere(
    options: ExternalVoiceFindAllOptions,
  ): Prisma.ExternalVoiceWhereInput {
    const {
      provider,
      providers,
      search,
      includeInactive = false,
      isActive = includeInactive ? undefined : true,
    } = options;
    const where: Prisma.ExternalVoiceWhereInput = {};

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (providers && providers.length > 0) {
      where.externalProvider = { in: providers };
    } else if (provider) {
      where.externalProvider = provider;
    }

    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    return where;
  }

  findActive(
    provider: VoiceProvider,
    externalId: string,
  ): Promise<ExternalVoice | null> {
    return this.prisma.externalVoice.findFirst({
      where: { externalId, externalProvider: provider, isActive: true },
    });
  }

  findOne(id: string): Promise<ExternalVoice | null> {
    return this.prisma.externalVoice.findUnique({ where: { id } });
  }

  async patch(id: string, dto: ExternalVoicePatchDto): Promise<ExternalVoice> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} patching catalog entry`, { id });

    const data: {
      isActive?: boolean;
      isDefaultSelectable?: boolean;
      isFeatured?: boolean;
    } = {};

    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }

    if (dto.isDefaultSelectable !== undefined) {
      data.isDefaultSelectable = dto.isDefaultSelectable;
    }

    if (dto.isFeatured !== undefined) {
      data.isFeatured = dto.isFeatured;
    }

    return this.prisma.externalVoice.update({ data, where: { id } });
  }

  async syncFromProviders(providers?: SyncableProvider[]): Promise<SyncResult> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const targetProviders: SyncableProvider[] =
      providers && providers.length > 0
        ? providers
        : [VoiceProvider.ELEVENLABS, VoiceProvider.HEYGEN];

    this.loggerService.log(`${url} starting sync`, {
      providers: targetProviders,
    });

    const result: SyncResult = { created: 0, total: 0, updated: 0 };

    for (const provider of targetProviders) {
      if (provider === VoiceProvider.ELEVENLABS) {
        const voices = await this.elevenLabsService.getVoices();
        this.addSyncCounts(
          result,
          await this.reconcileCatalog(
            VoiceProvider.ELEVENLABS,
            voices.map((voice) => ({
              externalId: voice.voiceId,
              name: voice.name,
              sampleAudioUrl: voice.preview ?? null,
            })),
          ),
        );
      }

      if (provider === VoiceProvider.HEYGEN) {
        const voices = await this.heygenService.getVoices();
        this.addSyncCounts(
          result,
          await this.reconcileCatalog(
            VoiceProvider.HEYGEN,
            voices.map((voice) => ({
              externalId: voice.voiceId,
              name: voice.name,
              providerData: { gender: voice.gender, index: voice.index },
              sampleAudioUrl: voice.preview || null,
            })),
          ),
        );

        // An empty fetch is indistinguishable from a provider outage, so only
        // retire voices HeyGen dropped when it returned a catalog.
        if (voices.length > 0) {
          // sql-risk-audit: ignore bulk-write-tenant-review -- ExternalVoice is a global provider catalog with no organization scope
          await this.prisma.externalVoice.updateMany({
            data: { isActive: false },
            where: {
              externalId: { notIn: voices.map((voice) => voice.voiceId) },
              externalProvider: VoiceProvider.HEYGEN,
              isActive: true,
            },
          });
        }
      }
    }

    this.loggerService.log(`${url} sync complete`, result);

    return result;
  }

  private addSyncCounts(result: SyncResult, counts: SyncResult): void {
    result.created += counts.created;
    result.total += counts.total;
    result.updated += counts.updated;
  }

  /**
   * Writes one provider's fetched catalog in bulk. The catalog holds thousands
   * of voices, so a round trip per voice made every sync thousands of queries;
   * this reads the provider's rows once, inserts the new voices in batches and
   * writes only the rows whose provider fields changed. `updated` counts those
   * changed rows; `total` counts every voice the provider returned.
   */
  private async reconcileCatalog(
    provider: SyncableProvider,
    entries: CatalogEntry[],
  ): Promise<SyncResult> {
    // A provider listing the same voice twice: the last entry wins, as it did
    // with one upsert per voice.
    const fetched = new Map(entries.map((entry) => [entry.externalId, entry]));
    if (fetched.size === 0) {
      return { created: 0, total: 0, updated: 0 };
    }

    // One provider's slice of the global catalog, read once to diff in memory.
    const existing = await this.prisma.externalVoice.findMany({
      select: {
        externalId: true,
        id: true,
        name: true,
        providerData: true,
        sampleAudioUrl: true,
      },
      where: { externalProvider: provider },
    });
    const existingById = new Map(existing.map((row) => [row.externalId, row]));

    const toCreate: Prisma.ExternalVoiceCreateManyInput[] = [];
    const toUpdate: Array<{ id: string; entry: CatalogEntry }> = [];
    for (const entry of fetched.values()) {
      const row = existingById.get(entry.externalId);
      if (!row) {
        toCreate.push({
          externalId: entry.externalId,
          externalProvider: provider,
          isActive: true,
          isDefaultSelectable: true,
          isFeatured: false,
          name: entry.name,
          providerData: entry.providerData ?? {},
          sampleAudioUrl: entry.sampleAudioUrl,
        });
      } else if (hasCatalogChanges(row, entry)) {
        toUpdate.push({ entry, id: row.id });
      }
    }

    let created = 0;
    for (let i = 0; i < toCreate.length; i += CATALOG_WRITE_BATCH_SIZE) {
      const batch = await this.prisma.externalVoice.createMany({
        data: toCreate.slice(i, i + CATALOG_WRITE_BATCH_SIZE),
        skipDuplicates: true,
      });
      created += batch.count;
    }

    for (let i = 0; i < toUpdate.length; i += CATALOG_WRITE_BATCH_SIZE) {
      await this.prisma.$transaction(
        toUpdate.slice(i, i + CATALOG_WRITE_BATCH_SIZE).map(({ entry, id }) =>
          this.prisma.externalVoice.update({
            data: {
              name: entry.name,
              sampleAudioUrl: entry.sampleAudioUrl,
              ...(entry.providerData
                ? { providerData: entry.providerData }
                : {}),
            },
            where: { id },
          }),
        ),
      );
    }

    return { created, total: fetched.size, updated: toUpdate.length };
  }
}

const CATALOG_WRITE_BATCH_SIZE = 500;

interface CatalogEntry {
  externalId: string;
  name: string;
  sampleAudioUrl: string | null;
  /** Omitted when the provider has no extra fields to refresh. */
  providerData?: Record<string, string | number | null>;
}

function hasCatalogChanges(
  row: Pick<ExternalVoice, 'name' | 'providerData' | 'sampleAudioUrl'>,
  entry: CatalogEntry,
): boolean {
  if (row.name !== entry.name || row.sampleAudioUrl !== entry.sampleAudioUrl) {
    return true;
  }
  if (!entry.providerData) {
    return false;
  }
  const stored = row.providerData;
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return true;
  }
  const storedKeys = Object.keys(stored);
  const fetchedKeys = Object.keys(entry.providerData);
  return (
    storedKeys.length !== fetchedKeys.length ||
    fetchedKeys.some((key) => stored[key] !== entry.providerData?.[key])
  );
}
