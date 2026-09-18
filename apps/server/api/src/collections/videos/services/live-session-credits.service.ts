import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import type { CreateLiveSessionDto } from '@api/collections/videos/dto/create-live-session.dto';
import {
  assertLiveSessionCeilingSeconds,
  isLiveSessionPastCeiling,
  liveSessionElapsedSeconds,
} from '@api/collections/videos/services/live-session-credits.util';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import type { ReservationCreditsConfig } from '@api/helpers/utils/credits/generation-credit-reservation.util';
import { createInsufficientCreditsException } from '@api/helpers/utils/credits/insufficient-credits.util';
import { scopedWhere } from '@api/index';
import { ByokService } from '@api/services/byok/byok.service';
import { resolveModelByokProvider } from '@api/services/byok/byok-provider-map.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivitySource,
  type ByokProvider,
  LiveSessionStatus,
  LiveSessionTerminateReason,
} from '@genfeedai/contracts';
import {
  LIVE_SESSION_WORKLOAD_TYPE,
  MODEL_OUTPUT_CAPABILITIES,
} from '@genfeedai/contracts/constants';
import {
  buildPricingAuditStamp,
  calculateVideoGenerationCredits,
} from '@genfeedai/pricing';
import type { LiveSession } from '@genfeedai/prisma';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

type LiveSessionCreditsRequest = {
  body?: unknown;
  creditsConfig?: ReservationCreditsConfig;
  user?: AuthenticatedUser;
};

@Injectable()
export class LiveSessionCreditsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly modelsService: ModelsService,
    private readonly byokService: ByokService,
  ) {}

  async openSession(params: {
    dto: CreateLiveSessionDto;
    now?: Date;
    request: LiveSessionCreditsRequest;
    user: AuthenticatedUser;
  }): Promise<LiveSession> {
    const now = params.now ?? new Date();
    const ceilingSeconds = assertLiveSessionCeilingSeconds(
      params.dto.ceilingSeconds,
    );
    const modelKey = params.dto.model;
    const { requiredCredits, resolvedModelDoc } = await this.quoteCredits({
      durationSeconds: ceilingSeconds,
      modelKey,
      resolution: params.dto.resolution,
    });
    const byokProvider = await this.resolveActiveByokProvider(
      params.user.organizationId,
      modelKey,
      resolvedModelDoc?.provider,
    );

    if (
      !byokProvider &&
      !(await this.creditsUtilsService.checkOrganizationCreditsAvailable(
        params.user.organizationId,
        requiredCredits,
      ))
    ) {
      const balance =
        await this.creditsUtilsService.getOrganizationCreditsBalance(
          params.user.organizationId,
        );
      throw createInsufficientCreditsException(requiredCredits, balance);
    }

    params.request.creditsConfig = {
      ...params.request.creditsConfig,
      amount: requiredCredits,
      deferred: true,
      description: 'Live session',
      modelKey,
      source: ActivitySource.VIDEO_GENERATION,
      ...(resolvedModelDoc
        ? { pricingMetadata: buildPricingAuditStamp(resolvedModelDoc) }
        : {}),
    };

    const ceilingEndsAt = new Date(now.getTime() + ceilingSeconds * 1000);
    let reservationId: string | null = null;
    if (byokProvider) {
      params.request.creditsConfig = {
        ...params.request.creditsConfig,
        isByokBypass: true,
        provider: byokProvider,
      };
    } else {
      reservationId = await this.reserveCeiling({
        amount: requiredCredits,
        ceilingEndsAt,
        organizationId: params.user.organizationId,
        request: params.request,
        userId: params.user.userId,
      });
    }

    try {
      return await this.prisma.liveSession.create({
        data: {
          brandId: params.user.brandId || null,
          ceilingEndsAt,
          ceilingSeconds,
          isByokBypass: Boolean(byokProvider),
          modelKey,
          organizationId: params.user.organizationId,
          reservationId,
          reservedCredits: requiredCredits,
          resolution: params.dto.resolution ?? null,
          startedAt: now,
          status: LiveSessionStatus.OPEN,
          userId: params.user.userId,
        },
      });
    } catch (error: unknown) {
      if (reservationId) {
        await this.creditsUtilsService.releaseReservation({
          organizationId: params.user.organizationId,
          reservationId,
        });
      }
      throw error;
    }
  }

  async getSession(params: {
    now?: Date;
    organizationId: string;
    sessionId: string;
    userId: string;
  }): Promise<LiveSession> {
    const session = await this.findOwnedSession(params);
    const now = params.now ?? new Date();
    if (
      session.status === LiveSessionStatus.OPEN &&
      isLiveSessionPastCeiling({
        ceilingEndsAt: session.ceilingEndsAt,
        now,
      })
    ) {
      return this.terminateSession({
        ...params,
        now,
        reason: LiveSessionTerminateReason.CEILING,
      });
    }
    return session;
  }

  async terminateSession(params: {
    now?: Date;
    organizationId: string;
    reason?: LiveSessionTerminateReason;
    sessionId: string;
    userId: string;
  }): Promise<LiveSession> {
    const session = await this.findOwnedSession(params);
    if (session.status === LiveSessionStatus.TERMINATED) {
      return session;
    }

    const now = params.now ?? new Date();
    const isPastCeiling = isLiveSessionPastCeiling({
      ceilingEndsAt: session.ceilingEndsAt,
      now,
    });
    const reason =
      isPastCeiling || params.reason === LiveSessionTerminateReason.CEILING
        ? LiveSessionTerminateReason.CEILING
        : LiveSessionTerminateReason.USER;
    const elapsedSeconds = liveSessionElapsedSeconds({
      ceilingSeconds: session.ceilingSeconds,
      now,
      startedAt: session.startedAt,
    });
    const { requiredCredits: settledCredits } = await this.quoteCredits({
      durationSeconds: elapsedSeconds,
      modelKey: session.modelKey,
      resolution: session.resolution,
    });

    if (session.reservationId && !session.isByokBypass) {
      await this.settleHeldReservation({
        actorUserId: params.userId,
        actualAmount: settledCredits,
        organizationId: params.organizationId,
        reservationId: session.reservationId,
      });
    }

    return this.prisma.liveSession.update({
      data: {
        elapsedSeconds,
        settledCredits,
        status: LiveSessionStatus.TERMINATED,
        terminateReason: reason,
        terminatedAt: now,
      },
      where: scopedWhere(params.organizationId, { id: session.id }),
    });
  }

  async terminateDue(now = new Date()): Promise<number> {
    // tenant-scope-ignore: platform sweep; terminateSession re-scopes each row
    const due = await this.prisma.liveSession.findMany({
      take: 100,
      where: {
        ceilingEndsAt: { lte: now },
        isDeleted: false,
        status: LiveSessionStatus.OPEN,
      },
    });

    let terminated = 0;
    for (const session of due) {
      await this.terminateSession({
        now,
        organizationId: session.organizationId,
        reason: LiveSessionTerminateReason.CEILING,
        sessionId: session.id,
        userId: session.userId,
      });
      terminated += 1;
    }
    return terminated;
  }

  private async findOwnedSession(params: {
    organizationId: string;
    sessionId: string;
    userId: string;
  }): Promise<LiveSession> {
    const session = await this.prisma.liveSession.findFirst({
      where: scopedWhere(params.organizationId, {
        id: params.sessionId,
        userId: params.userId,
      }),
    });
    if (!session) {
      throw new HttpException(
        {
          detail: `LiveSession ${params.sessionId} doesn't exist`,
          title: 'LiveSession not found',
        },
        HttpStatus.NOT_FOUND,
      );
    }
    return session;
  }

  private async quoteCredits(params: {
    durationSeconds: number;
    modelKey: string;
    resolution?: string | null;
  }) {
    const resolvedModelDoc = await this.modelsService.findOne({
      key: baseModelKey(params.modelKey),
    });
    const { credits: requiredCredits } = calculateVideoGenerationCredits({
      duration: params.durationSeconds,
      isBatchSupported:
        MODEL_OUTPUT_CAPABILITIES[params.modelKey]?.isBatchSupported ?? false,
      modelKey: params.modelKey,
      outputs: 1,
      pricing: resolvedModelDoc,
      resolution: params.resolution ?? undefined,
    });
    return { requiredCredits, resolvedModelDoc };
  }

  private async reserveCeiling(params: {
    amount: number;
    ceilingEndsAt: Date;
    organizationId: string;
    request: LiveSessionCreditsRequest;
    userId: string;
  }): Promise<string> {
    const workloadId = randomUUID();
    try {
      const reservation = await this.creditsUtilsService.reserveCredits({
        actorUserId: params.userId,
        amount: params.amount,
        expiresAt: params.ceilingEndsAt,
        idempotencyKey: `${LIVE_SESSION_WORKLOAD_TYPE}:${workloadId}`,
        organizationId: params.organizationId,
        workloadId,
        workloadType: LIVE_SESSION_WORKLOAD_TYPE,
      });
      params.request.creditsConfig = {
        ...params.request.creditsConfig,
        amount: reservation.amount,
        description:
          params.request.creditsConfig?.description ?? 'Live session',
        reservationId: reservation.id,
      };
      return reservation.id;
    } catch (error: unknown) {
      if (
        error instanceof BusinessLogicException &&
        error.errorCode === 'INSUFFICIENT_CREDITS'
      ) {
        const balance =
          await this.creditsUtilsService.getOrganizationCreditsBalance(
            params.organizationId,
          );
        throw createInsufficientCreditsException(params.amount, balance);
      }
      throw error;
    }
  }

  private async settleHeldReservation(params: {
    actorUserId: string;
    actualAmount: number;
    organizationId: string;
    reservationId: string;
  }): Promise<void> {
    try {
      await this.creditsUtilsService.settleReservation({
        actorUserId: params.actorUserId,
        actualAmount: params.actualAmount,
        description: 'Live session',
        organizationId: params.organizationId,
        reservationId: params.reservationId,
        source: ActivitySource.VIDEO_GENERATION,
      });
    } catch (error: unknown) {
      if (
        error instanceof BusinessLogicException &&
        (error.errorCode === 'SETTLEMENT_AMOUNT_MISMATCH' ||
          error.message.includes('cannot be settled'))
      ) {
        return;
      }
      throw error;
    }
  }

  private async resolveActiveByokProvider(
    organizationId: string,
    modelKey: string,
    modelProvider?: string,
  ): Promise<ByokProvider | undefined> {
    const provider = resolveModelByokProvider(modelKey, modelProvider);
    if (
      !provider ||
      !(await this.byokService.isByokActiveForProvider(
        organizationId,
        provider,
      ))
    ) {
      return undefined;
    }
    if (!(await this.byokService.isByokBillingInGoodStanding(organizationId))) {
      throw new HttpException(
        {
          detail:
            'BYOK access is suspended due to an unpaid platform fee invoice. Please update your payment method or purchase a credit pack.',
          title: 'BYOK billing past due',
        },
        HttpStatus.FORBIDDEN,
      );
    }
    return provider;
  }
}
