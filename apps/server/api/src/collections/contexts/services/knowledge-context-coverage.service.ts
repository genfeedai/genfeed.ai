import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import type { KnowledgeActor } from '@api/collections/contexts/interfaces/knowledge-actor.interface';
import { KnowledgeRecordsService } from '@api/collections/contexts/services/knowledge-records.service';
import {
  deriveKnowledgeCoverageFamily,
  deriveSocialConnectionsCoverageFamily,
  isContextCoverageIncomplete,
  type KnowledgeCoverageSourceRow,
} from '@api/collections/contexts/utils/context-coverage.util';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  fromPrismaCredentialPlatform,
  KnowledgeSourcePurpose,
} from '@genfeedai/contracts';
import type {
  ContextCoverage,
  ContextCoverageFamily,
  ContextCoverageUsage,
} from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export const CONTEXT_COVERAGE_SOURCE_LIMIT = 200;
export const CONTEXT_COVERAGE_CREDENTIAL_LIMIT = 50;

export interface ContextCoverageRequest {
  /** Knowledge purposes to report; omitted means every purpose the usage reads. */
  purposes?: KnowledgeSourcePurpose[];
  usage: ContextCoverageUsage;
}

/**
 * Derives, per source family, whether the context an answer would be built from
 * is complete. Scope always comes from the authenticated actor: callers cannot
 * widen it, and a family the actor may not read is absent rather than empty.
 */
@Injectable()
export class KnowledgeContextCoverageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brandAccess: BrandAccessService,
    private readonly records: KnowledgeRecordsService,
    private readonly loggerService: LoggerService,
  ) {}

  async forActor(
    actor: KnowledgeActor,
    request: ContextCoverageRequest,
    now: Date = new Date(),
  ): Promise<ContextCoverage> {
    // Authorization failures propagate; only reads of an authorized family may degrade to `failed`.
    await this.brandAccess.resolve(actor);
    if (actor.brandId) await this.brandAccess.assert(actor, actor.brandId);

    const families: ContextCoverageFamily[] = [];
    for (const purpose of this.purposesFor(request)) {
      families.push(await this.knowledgeFamily(actor, purpose, now));
    }
    if (request.usage === 'search' && actor.brandId) {
      families.push(await this.socialFamily(actor, actor.brandId, now));
    }
    return {
      families,
      isIncomplete: isContextCoverageIncomplete(families),
      usage: request.usage,
    };
  }

  /** Automatic answer context only injects BRAND_TRUTH; search can read every purpose. */
  private purposesFor(
    request: ContextCoverageRequest,
  ): KnowledgeSourcePurpose[] {
    if (request.usage === 'context')
      return [KnowledgeSourcePurpose.BRAND_TRUTH];
    const all = Object.values(KnowledgeSourcePurpose);
    return request.purposes?.length
      ? all.filter((purpose) => request.purposes?.includes(purpose))
      : all;
  }

  private async knowledgeFamily(
    actor: KnowledgeActor,
    purpose: KnowledgeSourcePurpose,
    now: Date,
  ): Promise<ContextCoverageFamily> {
    try {
      // One extra row distinguishes a complete inventory from a truncated one.
      const fetched = await this.prisma.knowledgeSource.findMany({
        orderBy: { id: 'asc' },
        select: {
          id: true,
          lastSuccessfulSyncAt: true,
          staleAt: true,
          syncState: true,
          title: true,
          versions: {
            select: {
              expiresAt: true,
              processingState: true,
              retentionState: true,
              retrievalState: true,
            },
            take: 1,
            where: scopedWhere(actor.organizationId, {
              isCurrent: true,
              isDeleted: false,
            }),
          },
        },
        take: CONTEXT_COVERAGE_SOURCE_LIMIT + 1,
        where: scopedWhere(actor.organizationId, {
          ...(await this.records.ownership(actor)),
          isVisible: true,
          purpose,
        }),
      });
      const rows: KnowledgeCoverageSourceRow[] = fetched
        .slice(0, CONTEXT_COVERAGE_SOURCE_LIMIT)
        .map(({ versions, ...source }) => ({
          ...source,
          currentVersion: versions[0] ?? null,
        }));
      return deriveKnowledgeCoverageFamily(purpose, rows, {
        isInventoryComplete: fetched.length <= CONTEXT_COVERAGE_SOURCE_LIMIT,
        now,
      });
    } catch (error) {
      this.loggerService.warn('Knowledge coverage read failed', {
        error: error instanceof Error ? error.message : 'unknown',
        organizationId: actor.organizationId,
        purpose,
      });
      return {
        family: 'knowledge',
        lastSuccessAt: null,
        purpose,
        recoveries: [],
        state: 'failed',
      };
    }
  }

  private async socialFamily(
    actor: KnowledgeActor,
    brandId: string,
    now: Date,
  ): Promise<ContextCoverageFamily> {
    try {
      const fetched = await this.prisma.credential.findMany({
        orderBy: { id: 'asc' },
        select: { isConnected: true, platform: true, refreshTokenExpiry: true },
        take: CONTEXT_COVERAGE_CREDENTIAL_LIMIT + 1,
        // A row that never connected is an abandoned sign-in, not a connection to report.
        where: scopedWhere(actor.organizationId, {
          brandId,
          OR: [{ isConnected: true }, { connectedAt: { not: null } }],
        }),
      });
      const rows = fetched
        .slice(0, CONTEXT_COVERAGE_CREDENTIAL_LIMIT)
        .flatMap((credential) => {
          const platform = fromPrismaCredentialPlatform(credential.platform);
          return platform
            ? [{ ...credential, platform: String(platform) }]
            : [];
        });
      return deriveSocialConnectionsCoverageFamily(rows, {
        isInventoryComplete:
          fetched.length <= CONTEXT_COVERAGE_CREDENTIAL_LIMIT,
        now,
      });
    } catch (error) {
      this.loggerService.warn('Social connection coverage read failed', {
        error: error instanceof Error ? error.message : 'unknown',
        organizationId: actor.organizationId,
      });
      return {
        family: 'social_connections',
        lastSuccessAt: null,
        recoveries: [],
        state: 'failed',
      };
    }
  }
}
