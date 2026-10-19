import { ElevenLabsService } from '@api/services/integrations/elevenlabs/services/elevenlabs.service';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ExternalVoice, type Prisma, VoiceProvider } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
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
    const { skip, take, ...filters } = options;
    const where = this.buildWhere(filters);
    const [docs, totalDocs] = await Promise.all([
      this.prisma.externalVoice.findMany({
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
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

    let created = 0;
    let updated = 0;

    for (const provider of targetProviders) {
      if (provider === VoiceProvider.ELEVENLABS) {
        const voices = await this.elevenLabsService.getVoices();
        for (const voice of voices) {
          const result = await this.prisma.externalVoice.upsert({
            create: {
              externalId: voice.voiceId,
              externalProvider: VoiceProvider.ELEVENLABS,
              isActive: true,
              isDefaultSelectable: true,
              isFeatured: false,
              name: voice.name,
              providerData: {},
              sampleAudioUrl: voice.preview ?? null,
            },
            update: {
              name: voice.name,
              sampleAudioUrl: voice.preview ?? null,
            },
            where: {
              externalProvider_externalId: {
                externalId: voice.voiceId,
                externalProvider: VoiceProvider.ELEVENLABS,
              },
            },
          });

          // Prisma upsert always returns the record; detect create vs update via
          // comparing createdAt ≈ updatedAt (within 1 second tolerance).
          const wasCreated =
            Math.abs(result.createdAt.getTime() - result.updatedAt.getTime()) <
            1000;
          if (wasCreated) {
            created++;
          } else {
            updated++;
          }
        }
      }

      if (provider === VoiceProvider.HEYGEN) {
        const voices = await this.heygenService.getVoices();
        for (const voice of voices) {
          const result = await this.prisma.externalVoice.upsert({
            create: {
              externalId: voice.voiceId,
              externalProvider: VoiceProvider.HEYGEN,
              isActive: true,
              isDefaultSelectable: true,
              isFeatured: false,
              name: voice.name,
              providerData: { gender: voice.gender, index: voice.index },
              sampleAudioUrl: voice.preview || null,
            },
            update: {
              name: voice.name,
              providerData: { gender: voice.gender, index: voice.index },
              sampleAudioUrl: voice.preview || null,
            },
            where: {
              externalProvider_externalId: {
                externalId: voice.voiceId,
                externalProvider: VoiceProvider.HEYGEN,
              },
            },
          });

          const wasCreated =
            Math.abs(result.createdAt.getTime() - result.updatedAt.getTime()) <
            1000;
          if (wasCreated) {
            created++;
          } else {
            updated++;
          }
        }

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

    const total = created + updated;
    this.loggerService.log(`${url} sync complete`, { created, total, updated });

    return { created, total, updated };
  }
}
