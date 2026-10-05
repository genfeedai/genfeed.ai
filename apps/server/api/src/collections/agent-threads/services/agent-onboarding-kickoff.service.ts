import type { AgentRoomDocument } from '@api/collections/agent-threads/schemas/agent-thread.schema';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { AgentScopeContextService } from '@api/index';
import { AgentThreadProjectorService } from '@api/services/agent-threading/services/agent-thread-projector.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  AgentMessageRole,
  AgentThreadMode,
  AgentThreadStatus,
} from '@genfeedai/contracts';
import {
  ONBOARDING_GREETING,
  ONBOARDING_URL_PROMPT,
  ONBOARDING_URL_TITLE,
} from '@genfeedai/contracts/constants';
import { resolveSignupBrandDomain } from '@genfeedai/helpers';
import { Prisma, toPrismaJson } from '@genfeedai/prisma';
import { ConflictException, Injectable } from '@nestjs/common';

@Injectable()
export class AgentOnboardingKickoffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: AgentScopeContextService,
    private readonly projector: AgentThreadProjectorService,
  ) {}

  async kickoff(
    userId: string,
    organizationId: string,
    requestedBrandId?: string | null,
  ): Promise<AgentRoomDocument> {
    const member = await this.prisma.member.findFirst({
      where: { userId, organizationId, isActive: true, isDeleted: false },
    });
    if (!member) throw new NotFoundException('Organization membership');
    const onboardingUser = await this.prisma.user.findFirst({
      where: { id: userId, isDeleted: false },
      select: { isOnboardingCompleted: true },
    });
    if (onboardingUser?.isOnboardingCompleted)
      throw new ConflictException('Onboarding is already completed');
    const brand = await this.prisma.brand.findFirst({
      where: {
        ...(requestedBrandId ? { id: requestedBrandId } : {}),
        organizationId,
        isDeleted: false,
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!brand) throw new NotFoundException('Brand');
    const scope = await this.scopeService.prepareForTurn({
      organizationId,
      requestedBrandId: brand.id,
      userId,
    });
    const user = await this.prisma.user.findFirst({
      where: { id: userId, isDeleted: false },
      select: { email: true },
    });
    const config: Prisma.JsonObject =
      brand.agentConfig &&
      typeof brand.agentConfig === 'object' &&
      !Array.isArray(brand.agentConfig)
        ? brand.agentConfig
        : {};
    const marker = config.signupPrefill;
    const requestedDomain =
      marker &&
      typeof marker === 'object' &&
      !Array.isArray(marker) &&
      typeof marker.brandDomain === 'string'
        ? marker.brandDomain
        : undefined;
    const detected = resolveSignupBrandDomain({
      email: user?.email,
      requestedDomain,
    });

    return this.prisma.$transaction(
      async (tx) => {
        const key = `onboarding:${organizationId}:${userId}:${brand.id}`;
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
        const existing = await tx.agentThread.findFirst({
          where: {
            userId,
            organizationId,
            brandId: brand.id,
            source: 'onboarding',
            status: AgentThreadStatus.ACTIVE,
            isDeleted: false,
          },
          orderBy: { updatedAt: 'desc' },
        });
        if (existing) return existing as AgentRoomDocument;
        const thread = await tx.agentThread.create({
          data: {
            ...scope.initialScopeFields,
            userId,
            organizationId,
            brandId: brand.id,
            source: 'onboarding',
            status: AgentThreadStatus.ACTIVE,
            mode: AgentThreadMode.AUTO,
            title: ONBOARDING_URL_TITLE,
            isDeleted: false,
          },
        });
        const greeting = await tx.agentMessage.create({
          data: {
            threadId: thread.id,
            userId,
            organizationId,
            brandId: brand.id,
            role: AgentMessageRole.ASSISTANT,
            content: ONBOARDING_GREETING,
            isDeleted: false,
          },
        });
        const request = {
          requestId: `onboarding-url:${thread.id}`,
          fieldId: 'brandUrl',
          metadata: {
            brandId: brand.id,
            contextVersion: thread.contextVersion,
          },
          allowFreeText: true,
          title: ONBOARDING_URL_TITLE,
          prompt: ONBOARDING_URL_PROMPT,
          options:
            detected.websiteUrl && detected.domain
              ? [{ id: detected.websiteUrl, label: `Use ${detected.domain}` }]
              : [],
        };
        const occurredAt = new Date().toISOString();
        const event = await tx.agentThreadEvent.create({
          data: {
            organizationId,
            threadId: thread.id,
            sequence: 1,
            type: 'input.requested',
            commandId: `onboarding-kickoff:${thread.id}`,
            isDeleted: false,
            data: toPrismaJson({ occurredAt, payload: request, userId }),
          },
        });
        const projected = this.projector.applyEvent(null, {
          ...event,
          type: 'input.requested',
          payload: request,
          occurredAt,
          userId,
        });
        await tx.agentThreadSnapshot.create({
          data: {
            organizationId,
            threadId: thread.id,
            isDeleted: false,
            data: toPrismaJson({
              ...projected,
              source: 'onboarding',
              lastAssistantMessage: {
                content: ONBOARDING_GREETING,
                messageId: greeting.id,
                createdAt: greeting.createdAt.toISOString(),
              },
              threadStatus: thread.status,
              title: thread.title,
              inputRequests: [{ ...request, status: 'pending' }],
            }),
          },
        });
        return thread as AgentRoomDocument;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }
}
