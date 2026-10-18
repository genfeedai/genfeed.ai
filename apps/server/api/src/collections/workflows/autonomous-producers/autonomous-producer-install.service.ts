import type { SystemWorkflowCatalogService } from '@api/collections/workflows/services/system-workflow-catalog.service';
import type { WorkflowSchedulePrincipal } from '@api/collections/workflows/utils/workflow-schedule-actor.util';
import { SYSTEM_WORKFLOW_CATALOG } from '@api/collections/workflows/workflows.tokens';
import { resolveApiKeyEffectiveMemberRole } from '@api/helpers/utils/auth/api-key-role.util';
import { resolveOptionalProvider } from '@api/helpers/utils/module-ref/resolve-optional-provider.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { MemberRole } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

/** The catalog workflows that run an organization's autonomous producers. */
export const AUTONOMOUS_PRODUCER_TEMPLATES = {
  campaigns: [
    'agent-campaign-orchestration',
    'agent-campaign-trigger-evaluation',
  ],
  contentEngine: ['content-engine-production'],
} as const satisfies Record<string, readonly string[]>;

export type AutonomousProducer = keyof typeof AUTONOMOUS_PRODUCER_TEMPLATES;

/** The roles `POST /workflows` requires to install a system-catalog workflow. */
const PRODUCER_INSTALL_ROLES: readonly MemberRole[] = [
  MemberRole.OWNER,
  MemberRole.ADMIN,
  MemberRole.CREATOR,
];

export type AutonomousProducerInstallOutcome =
  | 'installed'
  | 'kept'
  | 'unauthorized'
  | 'unavailable';

/**
 * Installs an autonomous producer's catalog workflows when an organization
 * explicitly opts in (#7342), so the producer runs without a manual catalog
 * step. Only the opt-in action calls this; nothing installs on deploy.
 *
 * Any existing row for the template, including a paused or soft-deleted one,
 * is the tenant's own control and is kept exactly as it is, never re-enabled.
 * A failed install is logged and never fails the opt-in that triggered it.
 * Only a principal allowed to install catalog workflows directly (owner,
 * admin or creator) installs them; anyone else's opt-in saves without one.
 */
@Injectable()
export class AutonomousProducerInstallService {
  private readonly logContext = 'AutonomousProducerInstallService';

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async installOnOptIn(input: {
    organizationId: string;
    principal: WorkflowSchedulePrincipal;
    producer: AutonomousProducer;
  }): Promise<Record<string, AutonomousProducerInstallOutcome>> {
    const outcomes: Record<string, AutonomousProducerInstallOutcome> = {};
    const canInstall = await this.canInstallCatalogWorkflows(
      input.organizationId,
      input.principal,
    );
    for (const canonicalId of AUTONOMOUS_PRODUCER_TEMPLATES[input.producer]) {
      if (!canInstall) {
        outcomes[canonicalId] = 'unauthorized';
        continue;
      }
      outcomes[canonicalId] = await this.installTemplate(
        canonicalId,
        input.organizationId,
        input.principal,
      );
    }
    return outcomes;
  }

  private async canInstallCatalogWorkflows(
    organizationId: string,
    principal: WorkflowSchedulePrincipal,
  ): Promise<boolean> {
    const member = await this.prisma.member.findFirst({
      select: { role: { select: { key: true } } },
      where: {
        isActive: true,
        isDeleted: false,
        organizationId,
        userId: principal.userId,
      },
    });
    const roleKey = member?.role?.key as MemberRole | undefined;
    if (!roleKey) return false;
    return PRODUCER_INSTALL_ROLES.includes(
      resolveApiKeyEffectiveMemberRole(principal, roleKey),
    );
  }

  private async installTemplate(
    canonicalId: string,
    organizationId: string,
    principal: WorkflowSchedulePrincipal,
  ): Promise<AutonomousProducerInstallOutcome> {
    try {
      // tenant-scope-ignore: paused and soft-deleted installs are tenant opt-out controls (#4961); the organization filter remains mandatory
      const existing = await this.prisma.workflow.findFirst({
        select: { id: true },
        where: {
          metadata: { equals: canonicalId, path: ['sourceTemplateId'] },
          organizationId,
        },
      });
      if (existing) return 'kept';

      const catalog = resolveOptionalProvider<SystemWorkflowCatalogService>(
        this.moduleRef,
        SYSTEM_WORKFLOW_CATALOG,
      );
      if (!catalog) {
        this.logger.warn(
          `${this.logContext} system workflow catalog is unavailable`,
          { canonicalId, organizationId },
        );
        return 'unavailable';
      }
      await catalog.install({
        canonicalId,
        organizationId,
        schedulePrincipal: principal,
        userId: principal.userId,
      });
      return 'installed';
    } catch (error: unknown) {
      this.logger.error(`${this.logContext} producer install failed`, {
        canonicalId,
        error: error instanceof Error ? error.message : String(error),
        organizationId,
      });
      return 'unavailable';
    }
  }
}
