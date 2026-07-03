import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { CredentialPlatform, PostStatus } from '@genfeedai/enums';
import type {
  AccountHealthOverride,
  AccountHealthRiskLevel,
  AccountHealthSignals,
  AccountHealthSummary,
  AccountHealthThresholds,
  AccountWarmupState,
  AssessAccountHealthRequest,
  ManualAccountHealthOverrideRequest,
} from '@genfeedai/interfaces';
import { type Credential, type Prisma } from '@genfeedai/prisma';
import { BadRequestException, Injectable } from '@nestjs/common';

type CredentialHealthRecord = Credential & {
  externalUrl?: string | null;
  handle?: string | null;
  name?: string | null;
};

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

const MS_PER_DAY = 24 * 60 * 60 * 1000;

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

function readJsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
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
  constructor(private readonly prisma: PrismaService) {}

  async listBrandHealth(
    organizationId: string,
    brandId: string,
  ): Promise<AccountHealthSummary[]> {
    const credentials = await this.prisma.credential.findMany({
      orderBy: { createdAt: 'asc' },
      where: {
        brandId,
        isConnected: true,
        isDeleted: false,
        organizationId,
      },
    });

    return Promise.all(
      credentials.map((credential) =>
        this.assessCredentialHealth({
          brandId,
          credentialId: credential.id,
          organizationId,
        }),
      ),
    );
  }

  async assessCredentialHealth(
    params: AssessAccountHealthParams,
  ): Promise<AccountHealthSummary> {
    const credential = await this.findCredential(params);
    const thresholds = this.mergeThresholds(
      credential.platform as CredentialPlatform,
      params.request?.thresholds,
      credential.warmupThresholds,
    );
    const signals = await this.buildSignals(
      credential,
      params.request?.signals,
    );
    const summary = this.createSummary(credential, thresholds, signals);

    await this.prisma.credential.update({
      data: {
        warmupAssessedAt: summary.assessedAt
          ? new Date(summary.assessedAt)
          : new Date(),
        warmupHoldReason: summary.holdReason ?? null,
        warmupRiskLevel: summary.riskLevel,
        warmupScore: summary.score,
        warmupSignals: summary.signals as unknown as Prisma.InputJsonValue,
        warmupState: summary.state,
        warmupThresholds:
          summary.thresholds as unknown as Prisma.InputJsonValue,
      },
      where: { id: credential.id },
    });

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
      where: { id: credential.id },
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
  }): Promise<CredentialHealthRecord> {
    const credential = await this.prisma.credential.findFirst({
      where: {
        id: params.credentialId,
        isDeleted: false,
        organizationId: params.organizationId,
        ...(params.brandId ? { brandId: params.brandId } : {}),
      },
    });

    if (!credential) {
      throw new NotFoundException('Credential');
    }

    return credential as CredentialHealthRecord;
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

  private async buildSignals(
    credential: CredentialHealthRecord,
    overrides: Partial<AccountHealthSignals> | undefined,
  ): Promise<AccountHealthSignals> {
    const since = new Date(Date.now() - 30 * MS_PER_DAY);
    const [publishedPosts, recentFailures] = await Promise.all([
      this.prisma.post.count({
        where: {
          credentialId: credential.id,
          isDeleted: false,
          status: PostStatus.PUBLIC,
        },
      }),
      this.prisma.post.count({
        where: {
          createdAt: { gte: since },
          credentialId: credential.id,
          isDeleted: false,
          status: PostStatus.FAILED,
        },
      }),
    ]);

    const createdAt = credential.createdAt ?? new Date();
    const connectedDays = Math.max(
      0,
      Math.floor((Date.now() - createdAt.getTime()) / MS_PER_DAY),
    );
    const profileSignals = [
      credential.externalHandle,
      credential.externalName,
      credential.externalAvatar,
      credential.label,
    ].filter((value) => readString(value)).length;

    return {
      connectedDays: readNumber(overrides?.connectedDays, connectedDays),
      profileSignals: readNumber(overrides?.profileSignals, profileSignals),
      publishedPosts: readNumber(overrides?.publishedPosts, publishedPosts),
      recentFailures: readNumber(overrides?.recentFailures, recentFailures),
    };
  }

  private createSummary(
    credential: CredentialHealthRecord,
    thresholds: AccountHealthThresholds,
    signals: AccountHealthSignals,
  ): AccountHealthSummary {
    const now = new Date();
    const platform = credential.platform as CredentialPlatform;
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
    const holdPublishing =
      !override.isActive &&
      (state === 'not_started' || state === 'warming' || state === 'risky');
    const holdReason = holdPublishing
      ? this.getHoldReason(platform, state, riskLevel)
      : undefined;

    return {
      assessedAt: now.toISOString(),
      credentialId: credential.id,
      handle: readString(credential.externalHandle),
      holdPublishing,
      holdReason,
      label: this.getCredentialLabel(credential),
      override,
      platform,
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

  private getCredentialLabel(credential: CredentialHealthRecord): string {
    const explicitLabel =
      readString(credential.label) ?? readString(credential.externalName);
    const handle = readString(credential.externalHandle);

    if (explicitLabel) {
      return explicitLabel;
    }

    return handle
      ? `${credential.platform} @${handle.replace(/^@/, '')}`
      : credential.platform;
  }

  private getHoldReason(
    platform: CredentialPlatform,
    state: AccountWarmupState,
    riskLevel: AccountHealthRiskLevel,
  ): string {
    return `${platform} publishing is held because account warmup is ${state} (${riskLevel} risk). Confirm a manual override only after reviewing platform-specific guidance.`;
  }
}
