import { ResearchScanLimitReachedException } from '@api/helpers/exceptions/research-scan-limit/research-scan-limit.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { isSaaS } from '@genfeedai/config';
import type {
  ResearchScanLibrary,
  ResearchScanStatus,
} from '@genfeedai/contracts/interfaces';
import {
  getResearchScanLimitForTier,
  RESEARCH_SCAN_LIBRARIES,
  type ResearchScanLimit,
} from '@genfeedai/pricing';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ResearchAccessService } from './research-access.service';
import {
  type ResearchScanGrant,
  runWithResearchScanGrant,
} from './research-scan.context';

/** Far more rows than any limit allows in one window; a bound, not a limit. */
const WINDOW_ROW_CAP = 1_000;

export interface ResearchScanInput {
  library: ResearchScanLibrary;
  organizationId: string | undefined;
  /**
   * Refuse an organization without a plan before taking a scan, for the
   * collections that run on their own (a rescan nobody asked for). Those spend
   * a plan's scans; they never spend the weekly one of an organization
   * without a plan.
   */
  requiresPlan?: boolean;
  /** The brand (trends) or watched advertiser (ads) the scan is for. */
  subjectKey?: string;
}

type Reservation =
  | { isAllowed: true; scanId: string | null }
  | { isAllowed: false; exception: ResearchScanLimitReachedException };

function lockKey(organizationId: string, library: ResearchScanLibrary): string {
  return `research-scan:v1:${organizationId}:${library}`;
}

/**
 * Counts and limits scans. A scan is one fresh collection: a niche trends
 * search for a brand, or one poll of a competitor. The plan sets how many an
 * organization may take in a rolling window; it never decides whether the
 * organization may scan at all.
 *
 * The scan is reserved before any run starts, in one transaction behind an
 * advisory lock per organization and library, so two requests with one scan
 * left cannot both take it. A scan whose collection never reached the scraper
 * (a refusal, a cache hit, a run joined from another request) is released and
 * does not count.
 */
@Traced()
@Injectable()
export class ResearchScanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ResearchAccessService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Run a collection as one scan. Hosted collection inside `run` is admitted
   * by the reservation, with or without a plan. Throws
   * `ResearchScanLimitReachedException` before `run` starts when the
   * organization has used its scans.
   */
  async runScan<T>(
    input: ResearchScanInput,
    run: () => Promise<T>,
    now: Date = new Date(),
  ): Promise<T> {
    const { organizationId } = input;
    // Self-hosted installs have no scan limit, and a collection with no
    // organization is the platform's own, which the limit does not cover.
    if (!organizationId || !isSaaS()) return run();

    if (input.requiresPlan) {
      const { decision } = await this.access.resolve(organizationId, now);
      if (!decision.isAllowed) {
        throw new ServiceUnavailableException(decision.reason);
      }
    }
    const reservation = await this.reserve(
      organizationId,
      input.library,
      input.subjectKey,
      now,
    );
    if (!reservation.isAllowed) throw reservation.exception;

    const grant: ResearchScanGrant = {
      hasStartedRun: false,
      library: input.library,
      organizationId,
      scanId: reservation.scanId,
    };
    try {
      return await runWithResearchScanGrant(grant, run);
    } finally {
      if (!grant.hasStartedRun) await this.release(grant);
    }
  }

  /** Where each library stands for the organization: what is left and when. */
  async getStatuses(
    organizationId: string,
    now: Date = new Date(),
  ): Promise<ResearchScanStatus[]> {
    const { decision, tier } = await this.access.resolve(organizationId, now);
    const limit = isSaaS() ? getResearchScanLimitForTier(tier) : null;
    return Promise.all(
      RESEARCH_SCAN_LIBRARIES.map(async (library) => {
        if (limit === null) {
          return {
            hasPlan: decision.isAllowed,
            library,
            limit,
            nextAvailableAt: null,
            remaining: null,
            used: 0,
          };
        }
        const scans = await this.readWindow(
          this.prisma,
          organizationId,
          library,
          limit,
          now,
        );
        const nextAvailableAt = nextOpening(scans, limit);
        return {
          hasPlan: decision.isAllowed,
          library,
          limit,
          nextAvailableAt: nextAvailableAt?.toISOString() ?? null,
          remaining: Math.max(limit.maxScans - scans.length, 0),
          used: scans.length,
        };
      }),
    );
  }

  private async reserve(
    organizationId: string,
    library: ResearchScanLibrary,
    subjectKey: string | undefined,
    now: Date,
  ): Promise<Reservation> {
    const { decision, tier } = await this.access.resolve(organizationId, now);
    if (decision.reason === 'research_subscription_unverified') {
      // Fail closed: a scan is never taken on a guess about the plan.
      throw new ServiceUnavailableException(decision.reason);
    }
    const limit = getResearchScanLimitForTier(tier);
    if (limit === null) return { isAllowed: true, scanId: null };
    try {
      return await this.prisma.$transaction(async (tx) => {
        // sql-risk-audit: ignore raw-sql-review -- Takes a transaction-scoped advisory lock on a per-organization key; no table, tenant data or index is read.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey(organizationId, library)}, 0))::text`;
        const scans = await this.readWindow(
          tx,
          organizationId,
          library,
          limit,
          now,
        );
        const nextAvailableAt = nextOpening(scans, limit);
        if (nextAvailableAt) {
          return {
            exception: new ResearchScanLimitReachedException({
              hasPlan: decision.isAllowed,
              library,
              limit,
              nextAvailableAt,
            }),
            isAllowed: false,
          } as const;
        }
        const created = await tx.researchScan.create({
          data: {
            createdAt: now,
            isDeleted: false,
            library,
            organizationId,
            subjectKey: subjectKey ?? null,
          },
          select: { id: true },
        });
        return { isAllowed: true, scanId: created.id } as const;
      });
    } catch (error: unknown) {
      this.logger.error('Research scan could not be reserved', {
        error: error instanceof Error ? error.message : 'unknown',
        library,
        organizationId,
      });
      throw new ServiceUnavailableException('research_subscription_unverified');
    }
  }

  /** Give back a scan whose collection never reached the scraper. */
  private async release(grant: ResearchScanGrant): Promise<void> {
    if (!grant.scanId) return;
    try {
      await this.prisma.researchScan.updateMany({
        data: { isDeleted: true },
        where: scopedWhere(grant.organizationId, { id: grant.scanId }),
      });
    } catch (error: unknown) {
      // The scan stays counted: the organization loses a scan, never gains one.
      this.logger.warn('Research scan could not be released', {
        error: error instanceof Error ? error.message : 'unknown',
        library: grant.library,
        organizationId: grant.organizationId,
      });
    }
  }

  private async readWindow(
    db: Pick<PrismaService, 'researchScan'>,
    organizationId: string,
    library: ResearchScanLibrary,
    limit: ResearchScanLimit,
    now: Date,
  ): Promise<Date[]> {
    const rows = await db.researchScan.findMany({
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
      take: WINDOW_ROW_CAP,
      where: scopedWhere(organizationId, {
        createdAt: { gt: new Date(now.getTime() - limit.windowMs) },
        library,
      }),
    });
    return rows.map((row) => row.createdAt);
  }
}

/**
 * When the next scan opens, or null while one is available. With N scans in
 * the window and a limit of M, the (N - M + 1)th oldest has to leave it.
 */
function nextOpening(scans: Date[], limit: ResearchScanLimit): Date | null {
  if (scans.length < limit.maxScans) return null;
  const oldestToLeave = scans[scans.length - limit.maxScans];
  return new Date(oldestToLeave.getTime() + limit.windowMs);
}
