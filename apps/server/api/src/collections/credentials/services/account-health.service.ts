import {
  completedItemIdsFromEvents,
  hasPartialSocialWarmupScopes,
  reconnectForCredential,
  resolveSocialWarmupAccountAge,
  socialWarmupEventRecordFromStorage,
  socialWarmupSignalRecordFromStorage,
} from '@api/collections/social-warmup-enrollments/services/social-warmup-enrollment.helpers';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { readRecordOrEmpty as readJsonRecord } from '@api/shared/utils/object/read-record-or-empty.util';
import {
  CredentialPlatform,
  fromPrismaCredentialPlatform,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { postExecutionStateReadFilter } from '@genfeedai/contracts/api-types/contracts/scheduler.contract';
import { resolveSocialWarmupBlueprint } from '@genfeedai/contracts/api-types/contracts/social-warmup-blueprint.contract';
import {
  evaluateSocialWarmupJourney,
  SOCIAL_WARMUP_TELEMETRY_EVENT,
  type SocialWarmupJourneyEvaluation,
  sanitizeSocialWarmupTelemetry,
} from '@genfeedai/contracts/api-types/contracts/social-warmup-journey.contract';
import type {
  AccountHealthOverride,
  AccountHealthReconnect,
  AccountHealthRiskLevel,
  AccountHealthSignals,
  AccountHealthSummary,
  AccountHealthThresholds,
  AccountWarmupState,
  AssessAccountHealthRequest,
  ManualAccountHealthOverrideRequest,
} from '@genfeedai/contracts/interfaces';
import { type Credential, type Prisma } from '@genfeedai/prisma';
import { readString } from '@genfeedai/utils/data/extract.util';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable, Optional } from '@nestjs/common';

export interface AssessAccountHealthParams {
  brandId?: string;
  credentialId: string;
  organizationId: string;
  request?: AssessAccountHealthRequest;
}

export interface ManualOverrideParams {
  credentialId: string;
  organizationId: string;
  request: ManualAccountHealthOverrideRequest;
  userId: string;
}

export interface ScheduledPublishGate {
  holdPublishing: boolean;
  reason?: string;
  summary: AccountHealthSummary;
}

type AccountHealthEnrollment = Prisma.SocialWarmupEnrollmentGetPayload<{
  include: { events: true; signals: true };
}>;

type AccountHealthEvidence = {
  enrollment: AccountHealthEnrollment | null;
  publishedPosts: number;
  recentFailures: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const HEALTH_ASSESSMENT_CONCURRENCY = 4;

const WARMUP_PLATFORMS = new Set<CredentialPlatform>([
  CredentialPlatform.INSTAGRAM,
  CredentialPlatform.LINKEDIN,
  CredentialPlatform.TIKTOK,
  CredentialPlatform.TWITTER,
  CredentialPlatform.YOUTUBE,
]);

const DEFAULT_THRESHOLDS: AccountHealthThresholds = {
  maxRecentFailures: 0,
  minConnectedDays: 7,
  minProfileSignals: 2,
  minPublishedPosts: 3,
};

const PLATFORM_THRESHOLDS: Partial<
  Record<CredentialPlatform, AccountHealthThresholds>
> = {
  [CredentialPlatform.INSTAGRAM]: {
    maxRecentFailures: 0,
    minConnectedDays: 7,
    minProfileSignals: 2,
    minPublishedPosts: 3,
  },
  [CredentialPlatform.LINKEDIN]: {
    maxRecentFailures: 0,
    minConnectedDays: 5,
    minProfileSignals: 2,
    minPublishedPosts: 2,
  },
  [CredentialPlatform.TIKTOK]: {
    maxRecentFailures: 0,
    minConnectedDays: 3,
    minProfileSignals: 2,
    minPublishedPosts: 2,
  },
  [CredentialPlatform.TWITTER]: {
    maxRecentFailures: 0,
    minConnectedDays: 10,
    minProfileSignals: 2,
    minPublishedPosts: 4,
  },
  [CredentialPlatform.YOUTUBE]: {
    maxRecentFailures: 0,
    minConnectedDays: 3,
    minProfileSignals: 2,
    minPublishedPosts: 1,
  },
};

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readDateIso(
  value: Date | string | null | undefined,
): string | undefined {
  if (!value) {
    return undefined;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function requireDomainCredentialPlatform(
  platform: string | null | undefined,
): CredentialPlatform {
  const mapped = fromPrismaCredentialPlatform(platform);
  if (!mapped) {
    throw new BadRequestException(
      `Unknown credential platform: ${platform ?? 'missing'}`,
    );
  }
  return mapped;
}

function isOverrideActive(
  credential: Pick<Credential, 'warmupManualOverride' | 'warmupOverrideUntil'>,
  now: Date,
): boolean {
  if (!credential.warmupManualOverride) {
    return false;
  }

  return (
    !credential.warmupOverrideUntil || credential.warmupOverrideUntil > now
  );
}

@Injectable()
export class AccountHealthService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly logger?: LoggerService,
  ) {}

  async listBrandHealth(
    organizationId: string,
    brandId: string,
  ): Promise<AccountHealthSummary[]> {
    const credentials = await this.prisma.credential.findMany({
      orderBy: { createdAt: 'asc' },
      where: scopedWhere(organizationId, { brandId, isConnected: true }),
    });

    if (credentials.length === 0) return [];

    const credentialIds = credentials.map((credential) => credential.id);
    const accountWhere = scopedWhere(organizationId, {
      credentialId: { in: credentialIds },
    });
    const evidenceScope = scopedWhere(organizationId, { brandId });
    const since = new Date(Date.now() - 30 * MS_PER_DAY);
    const [publishedPosts, recentFailures, enrollments] = await Promise.all([
      this.prisma.post.groupBy({
        _count: { _all: true },
        by: ['credentialId'],
        where: scopedWhere(organizationId, {
          credentialId: { in: credentialIds },
          ...postExecutionStateReadFilter(TargetExecutionState.PUBLISHED),
        }),
      }),
      this.prisma.post.groupBy({
        _count: { _all: true },
        by: ['credentialId'],
        where: scopedWhere(organizationId, {
          createdAt: { gte: since },
          credentialId: { in: credentialIds },
          ...postExecutionStateReadFilter(TargetExecutionState.FAILED),
        }),
      }),
      this.prisma.socialWarmupEnrollment.findMany({
        include: {
          events: { where: evidenceScope },
          signals: { where: evidenceScope },
        },
        where: { ...accountWhere, brandId },
      }),
    ]);
    const publishedByCredential = new Map(
      publishedPosts.map((row) => [row.credentialId, row._count._all]),
    );
    const failuresByCredential = new Map(
      recentFailures.map((row) => [row.credentialId, row._count._all]),
    );
    const enrollmentByCredential = new Map(
      enrollments.map((enrollment) => [enrollment.credentialId, enrollment]),
    );
    const summaries: AccountHealthSummary[] = [];
    for (
      let index = 0;
      index < credentials.length;
      index += HEALTH_ASSESSMENT_CONCURRENCY
    ) {
      const batch = credentials.slice(
        index,
        index + HEALTH_ASSESSMENT_CONCURRENCY,
      );
      summaries.push(
        ...(await Promise.all(
          batch.map((credential) =>
            this.assessLoadedCredentialHealth(
              credential,
              { brandId, credentialId: credential.id, organizationId },
              {
                enrollment: enrollmentByCredential.get(credential.id) ?? null,
                publishedPosts: publishedByCredential.get(credential.id) ?? 0,
                recentFailures: failuresByCredential.get(credential.id) ?? 0,
              },
            ),
          ),
        )),
      );
    }
    return summaries;
  }

  async assessCredentialHealth(
    params: AssessAccountHealthParams,
  ): Promise<AccountHealthSummary> {
    const credential = await this.findCredential(params);
    const evidence = await this.loadEvidence(credential, params.organizationId);
    return this.assessLoadedCredentialHealth(credential, params, evidence);
  }

  private async assessLoadedCredentialHealth(
    credential: Credential,
    params: AssessAccountHealthParams,
    evidence: AccountHealthEvidence,
  ): Promise<AccountHealthSummary> {
    const platform = requireDomainCredentialPlatform(credential.platform);
    const thresholds = this.mergeThresholds(
      platform,
      params.request?.thresholds,
      credential.warmupThresholds,
    );
    const signals = this.buildSignals(
      credential,
      evidence,
      params.request?.signals,
    );
    const { enrollment } = evidence;
    const journey = this.evaluateJourney(credential, enrollment);
    const summary = this.createSummary(
      credential,
      thresholds,
      signals,
      journey,
    );
    if (credential.warmupState !== summary.state) {
      this.emitTelemetry(SOCIAL_WARMUP_TELEMETRY_EVENT.readinessTransition, {
        credentialId: credential.id,
        from: credential.warmupState,
        organizationId: params.organizationId,
        surface: 'account_health',
        to: summary.state,
      });
    }
    const assessedAt = summary.assessedAt
      ? new Date(summary.assessedAt)
      : new Date();

    // `warmupSignals` is shared with concurrent provider-evidence writers
    // (TikTok authorized-signal persistence, token refreshes). A stale
    // read-modify-write replacement would erase their keys, so the health
    // signals are merged atomically with `jsonb ||` in the database instead.
    await this.prisma.$executeRaw`
      UPDATE "credentials"
      SET "warmupAssessedAt" = ${assessedAt},
          "warmupHoldReason" = ${summary.holdReason ?? null},
          "warmupRiskLevel" = ${summary.riskLevel},
          "warmupScore" = ${summary.score},
          "warmupSignals" = COALESCE("warmupSignals", '{}'::jsonb) || ${JSON.stringify(summary.signals)}::jsonb,
          "warmupState" = ${summary.state},
          "warmupThresholds" = ${JSON.stringify(summary.thresholds)}::jsonb,
          "updatedAt" = NOW()
      WHERE "id" = ${credential.id}
        AND "organizationId" = ${params.organizationId}
        AND "isDeleted" = false
    `;

    return summary;
  }

  async confirmManualOverride(
    params: ManualOverrideParams,
  ): Promise<AccountHealthSummary> {
    if (params.request.confirm !== true) {
      throw new BadRequestException(
        'Manual account-health override requires explicit confirmation',
      );
    }

    const reason = params.request.reason.trim();
    if (!reason) {
      throw new BadRequestException(
        'Manual account-health override requires a reason',
      );
    }

    const expiresAt = params.request.expiresAt
      ? new Date(params.request.expiresAt)
      : null;
    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      throw new BadRequestException('Override expiry must be a valid date');
    }

    const credential = await this.findCredential(params);
    await this.prisma.credential.update({
      data: {
        warmupManualOverride: true,
        warmupOverrideConfirmedAt: new Date(),
        warmupOverrideConfirmedByUserId: params.userId,
        warmupOverrideReason: reason,
        warmupOverrideUntil: expiresAt,
      },
      where: scopedWhere(params.organizationId, { id: credential.id }),
    });

    this.emitTelemetry(SOCIAL_WARMUP_TELEMETRY_EVENT.override, {
      credentialId: credential.id,
      expiresAt: expiresAt?.toISOString() ?? null,
      organizationId: params.organizationId,
      reason,
      userId: params.userId,
    });

    return this.assessCredentialHealth({
      credentialId: credential.id,
      organizationId: params.organizationId,
    });
  }

  async evaluateScheduledPublishGate(params: {
    brandId: string;
    credentialId: string;
    organizationId: string;
  }): Promise<ScheduledPublishGate> {
    const summary = await this.assessCredentialHealth(params);
    if (summary.holdPublishing) {
      this.emitTelemetry(SOCIAL_WARMUP_TELEMETRY_EVENT.publishingHold, {
        credentialId: params.credentialId,
        holdReason: summary.holdReason,
        organizationId: params.organizationId,
        state: summary.state,
      });
    }

    return {
      holdPublishing: summary.holdPublishing,
      reason: summary.holdReason,
      summary,
    };
  }

  private async findCredential(params: {
    brandId?: string;
    credentialId: string;
    organizationId: string;
  }): Promise<Credential> {
    const credential = await this.prisma.credential.findFirst({
      where: scopedWhere(params.organizationId, {
        id: params.credentialId,
        ...(params.brandId ? { brandId: params.brandId } : {}),
      }),
    });

    if (!credential) {
      throw new NotFoundException('Credential');
    }

    return credential;
  }

  private mergeThresholds(
    platform: CredentialPlatform,
    requestThresholds: Partial<AccountHealthThresholds> | undefined,
    storedThresholds: Prisma.JsonValue,
  ): AccountHealthThresholds {
    const stored = readJsonRecord(storedThresholds);
    const platformDefaults =
      PLATFORM_THRESHOLDS[platform] ?? DEFAULT_THRESHOLDS;

    return {
      maxRecentFailures: Math.max(
        0,
        readNumber(
          requestThresholds?.maxRecentFailures,
          readNumber(
            stored.maxRecentFailures,
            platformDefaults.maxRecentFailures,
          ),
        ),
      ),
      minConnectedDays: Math.max(
        0,
        readNumber(
          requestThresholds?.minConnectedDays,
          readNumber(
            stored.minConnectedDays,
            platformDefaults.minConnectedDays,
          ),
        ),
      ),
      minProfileSignals: Math.max(
        1,
        readNumber(
          requestThresholds?.minProfileSignals,
          readNumber(
            stored.minProfileSignals,
            platformDefaults.minProfileSignals,
          ),
        ),
      ),
      minPublishedPosts: Math.max(
        0,
        readNumber(
          requestThresholds?.minPublishedPosts,
          readNumber(
            stored.minPublishedPosts,
            platformDefaults.minPublishedPosts,
          ),
        ),
      ),
    };
  }

  private async loadEvidence(
    credential: Credential,
    organizationId: string,
  ): Promise<AccountHealthEvidence> {
    const since = new Date(Date.now() - 30 * MS_PER_DAY);
    const [publishedPosts, recentFailures, enrollment] = await Promise.all([
      this.prisma.post.count({
        where: scopedWhere(organizationId, {
          credentialId: credential.id,
          ...postExecutionStateReadFilter(TargetExecutionState.PUBLISHED),
        }),
      }),
      this.prisma.post.count({
        where: scopedWhere(organizationId, {
          createdAt: { gte: since },
          credentialId: credential.id,
          ...postExecutionStateReadFilter(TargetExecutionState.FAILED),
        }),
      }),
      this.prisma.socialWarmupEnrollment.findFirst({
        include: {
          events: {
            where: scopedWhere(organizationId, {
              ...(credential.brandId ? { brandId: credential.brandId } : {}),
            }),
          },
          signals: {
            where: scopedWhere(organizationId, {
              ...(credential.brandId ? { brandId: credential.brandId } : {}),
            }),
          },
        },
        where: scopedWhere(organizationId, {
          ...(credential.brandId ? { brandId: credential.brandId } : {}),
          credentialId: credential.id,
        }),
      }),
    ]);

    return { enrollment, publishedPosts, recentFailures };
  }

  private buildSignals(
    credential: Credential,
    { enrollment, publishedPosts, recentFailures }: AccountHealthEvidence,
    overrides: Partial<AccountHealthSignals> | undefined,
  ): AccountHealthSignals {
    const accountAge = resolveSocialWarmupAccountAge(
      enrollment?.signals.map(socialWarmupSignalRecordFromStorage) ?? [],
    );
    const connectedDays = readNumber(
      overrides?.connectedDays,
      accountAge.accountAgeDays ?? 0,
    );
    const profileSignals = [
      credential.externalHandle,
      credential.externalName,
      credential.externalAvatar,
      credential.label,
    ].filter((value) => readString(value)).length;

    return {
      accountAgeDays: accountAge.accountAgeDays,
      accountAgeSource: accountAge.accountAgeSource,
      accountAgeStatus: accountAge.accountAgeStatus,
      connectedDays,
      profileSignals: readNumber(overrides?.profileSignals, profileSignals),
      publishedPosts: readNumber(overrides?.publishedPosts, publishedPosts),
      recentFailures: readNumber(overrides?.recentFailures, recentFailures),
    };
  }

  private evaluateJourney(
    credential: Credential,
    enrollment: AccountHealthEnrollment | null,
  ): SocialWarmupJourneyEvaluation | undefined {
    if (!enrollment?.blueprintId || !enrollment.blueprintVersion) {
      return undefined;
    }

    try {
      const blueprint = resolveSocialWarmupBlueprint({
        id: enrollment.blueprintId,
        version: enrollment.blueprintVersion,
      });
      const events = (enrollment.events ?? []).map((event) =>
        socialWarmupEventRecordFromStorage(event),
      );

      return evaluateSocialWarmupJourney({
        blueprint,
        enrollment: {
          completedItemIds: completedItemIdsFromEvents(events),
          hasPartialScopes: hasPartialSocialWarmupScopes(
            credential.warmupSignals,
          ),
          isCredentialConnected: credential.isConnected,
          reconnect: reconnectForCredential({
            credentialId: credential.id,
            hasPartialScopes: hasPartialSocialWarmupScopes(
              credential.warmupSignals,
            ),
            isConnected: credential.isConnected,
            platform: credential.platform,
          }),
          signals: enrollment.signals.map(socialWarmupSignalRecordFromStorage),
          startedAt: enrollment.startedAt,
          state: enrollment.state,
        },
        platform: requireDomainCredentialPlatform(credential.platform),
      });
    } catch {
      return undefined;
    }
  }

  private emitTelemetry(event: string, payload: Record<string, unknown>): void {
    this.logger?.log(event, sanitizeSocialWarmupTelemetry(payload));
  }

  private createSummary(
    credential: Credential,
    thresholds: AccountHealthThresholds,
    signals: AccountHealthSignals,
    journey?: SocialWarmupJourneyEvaluation,
  ): AccountHealthSummary {
    const now = new Date();
    const platform = requireDomainCredentialPlatform(credential.platform);
    const isWarmupPlatform = WARMUP_PLATFORMS.has(platform);

    if (!isWarmupPlatform) {
      return {
        assessedAt: now.toISOString(),
        credentialId: credential.id,
        handle: readString(credential.externalHandle),
        holdPublishing: false,
        label: this.getCredentialLabel(credential),
        override: this.buildOverride(credential, now),
        platform,
        riskLevel: 'low',
        score: 100,
        signals,
        state: 'healthy',
        thresholds,
      };
    }

    const connectedScore = credential.isConnected ? 20 : 0;
    const daysScore =
      thresholds.minConnectedDays === 0
        ? 25
        : Math.min(signals.connectedDays / thresholds.minConnectedDays, 1) * 25;
    const postsScore =
      thresholds.minPublishedPosts === 0
        ? 25
        : Math.min(signals.publishedPosts / thresholds.minPublishedPosts, 1) *
          25;
    const profileScore =
      Math.min(signals.profileSignals / thresholds.minProfileSignals, 1) * 20;
    const failurePenalty = Math.min(signals.recentFailures * 15, 30);
    const score = clampScore(
      connectedScore + daysScore + postsScore + profileScore - failurePenalty,
    );
    const state = this.resolveState(credential, signals, thresholds, score);
    const riskLevel = this.resolveRiskLevel(state, score);
    const override = this.buildOverride(credential, now);
    const reconnect = this.buildReconnect(credential);
    const scoreHold =
      state === 'not_started' || state === 'warming' || state === 'risky';
    const requiredCheckHold = Boolean(journey?.holdReason);
    const holdPublishing =
      !override.isActive && (requiredCheckHold || scoreHold);
    const holdReason = override.isActive
      ? undefined
      : (journey?.holdReason ??
        (scoreHold
          ? this.getHoldReason(platform, state, riskLevel)
          : undefined));

    return {
      assessedAt: now.toISOString(),
      credentialId: credential.id,
      handle: readString(credential.externalHandle),
      holdPublishing,
      holdReason,
      label: this.getCredentialLabel(credential),
      override,
      platform,
      reconnect,
      riskLevel,
      score,
      signals,
      state,
      thresholds,
    };
  }

  private resolveState(
    credential: Pick<Credential, 'isConnected'>,
    signals: AccountHealthSignals,
    thresholds: AccountHealthThresholds,
    score: number,
  ): AccountWarmupState {
    if (!credential.isConnected || score < 35) {
      return 'not_started';
    }

    if (signals.recentFailures > thresholds.maxRecentFailures) {
      return 'risky';
    }

    if (score >= 80) {
      return 'healthy';
    }

    return 'warming';
  }

  private resolveRiskLevel(
    state: AccountWarmupState,
    score: number,
  ): AccountHealthRiskLevel {
    if (state === 'healthy') {
      return 'low';
    }

    if (state === 'risky' || score < 35) {
      return 'high';
    }

    return 'medium';
  }

  private buildOverride(
    credential: Pick<
      Credential,
      | 'warmupManualOverride'
      | 'warmupOverrideConfirmedAt'
      | 'warmupOverrideConfirmedByUserId'
      | 'warmupOverrideReason'
      | 'warmupOverrideUntil'
    >,
    now: Date,
  ): AccountHealthOverride {
    return {
      confirmedAt: readDateIso(credential.warmupOverrideConfirmedAt),
      confirmedByUserId: readString(credential.warmupOverrideConfirmedByUserId),
      expiresAt: readDateIso(credential.warmupOverrideUntil),
      isActive: isOverrideActive(credential, now),
      reason: readString(credential.warmupOverrideReason),
    };
  }

  private buildReconnect(
    credential: Pick<
      Credential,
      'id' | 'isConnected' | 'platform' | 'warmupSignals'
    >,
  ): AccountHealthReconnect | undefined {
    const platform = requireDomainCredentialPlatform(credential.platform);
    return reconnectForCredential({
      credentialId: credential.id,
      hasPartialScopes: hasPartialSocialWarmupScopes(credential.warmupSignals),
      isConnected: credential.isConnected,
      platform,
    });
  }

  private getCredentialLabel(credential: Credential): string {
    const explicitLabel =
      readString(credential.label) ?? readString(credential.externalName);
    const handle = readString(credential.externalHandle);
    const platform = requireDomainCredentialPlatform(credential.platform);

    if (explicitLabel) {
      return explicitLabel;
    }

    return handle ? `${platform} @${handle.replace(/^@/, '')}` : platform;
  }

  private getHoldReason(
    platform: CredentialPlatform,
    state: AccountWarmupState,
    riskLevel: AccountHealthRiskLevel,
  ): string {
    return `${platform} publishing is held because account warmup is ${state} (${riskLevel} risk). Confirm a manual override only after reviewing platform-specific guidance.`;
  }
}
