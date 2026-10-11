import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import { refreshWorkflowActor } from '@api/authorization/brand-access/workflow-actor.util';
import { isStrategyEnabled } from '@api/collections/agent-strategies/services/agent-strategy-schedule-actor.util';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import {
  type AgentInitiatingPrincipal,
  resolveToolSchedulePrincipal,
} from '@api/services/agent-orchestrator/utils/agent-initiating-principal.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { readRecord } from '@genfeedai/utils/data/extract.util';
import { LoggerService } from '@libs/logger/logger.service';
import { ForbiddenException, Injectable } from '@nestjs/common';

/**
 * Proactive, campaign and strategy turns have no live request, so the tool
 * context carries no authenticated principal and a schedule they save would be
 * stored unbound (which Cloud then pauses). A strategy persists the actor that
 * saved or enabled it; this service lets such a turn bind that actor, and only
 * after reading its authority live again: membership, API key validity and scope
 * shrink (`refreshWorkflowActor`) plus access to the turn's brand.
 *
 * A strategy that is no longer active and enabled, has no actor, or whose actor
 * has lost access yields no principal, so the schedule is saved unbound and Cloud
 * pauses it. The actor is never inferred from the strategy's owner.
 */
@Injectable()
export class AgentStrategyScheduleAuthorityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brandAccess: BrandAccessService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * The context a schedule-saving tool runs with. A turn that already has a
   * principal (an authenticated approval, a reviewer's redemption) keeps it; a
   * strategy turn without one gets the strategy's live-refreshed actor.
   */
  async withScheduleAuthority(
    ctx: ToolExecutionContext,
  ): Promise<ToolExecutionContext> {
    if (!ctx.strategyId || resolveToolSchedulePrincipal(ctx)) {
      return ctx;
    }
    const principal = await this.resolveStrategyPrincipal(
      ctx.strategyId,
      ctx.organizationId,
      ctx.brandId,
    );
    return principal ? { ...ctx, scheduleAuthorityPrincipal: principal } : ctx;
  }

  private async resolveStrategyPrincipal(
    strategyId: string,
    organizationId: string,
    turnBrandId: string | undefined,
  ): Promise<AgentInitiatingPrincipal | undefined> {
    const strategy = await this.prisma.agentStrategy.findFirst({
      select: { brandId: true, config: true, scheduleInitiatingActor: true },
      where: scopedWhere(organizationId, { id: strategyId, isActive: true }),
    });
    if (
      !strategy ||
      !isStrategyEnabled(true, readRecord(strategy.config)) ||
      strategy.scheduleInitiatingActor === null
    ) {
      return undefined;
    }
    try {
      const actor = await refreshWorkflowActor(
        this.prisma,
        this.brandAccess,
        strategy.scheduleInitiatingActor,
        organizationId,
      );
      if (!actor) {
        return undefined;
      }
      const brandId = turnBrandId ?? strategy.brandId;
      if (brandId) {
        await this.brandAccess.assert(actor, brandId, this.prisma);
      }
      return actor;
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) {
        this.logger.warn(
          'Strategy schedule actor no longer has access; the schedule is saved unbound',
          { organizationId, strategyId },
        );
        return undefined;
      }
      // Anything else (a database outage) must not silently unbind a schedule.
      throw error;
    }
  }
}
