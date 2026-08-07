/**
 * Self-Hosted Seed Service
 * Creates the default workspace (User, Organization, Brand, OrganizationSetting)
 * on first application boot when running in self-hosted mode.
 *
 * Idempotent: creates missing default resources and repairs the owner membership
 * for workspaces created before Member became the authorization source of truth.
 */

import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { isSelfHostedDeployment } from '@genfeedai/config';
import { MemberRole } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

@Injectable()
export class SelfHostedSeedService implements OnApplicationBootstrap {
  private readonly context = 'SelfHostedSeedService';

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!isSelfHostedDeployment()) {
      return;
    }

    const existingOrg = await this.prisma.organization.findFirst({
      where: { isDefault: true },
    });

    if (existingOrg) {
      await this.ensureOwnerMembership(existingOrg.id, existingOrg.userId);
      this.logger.log(
        'Default workspace already exists — seed reconciliation complete',
        this.context,
      );
      return;
    }

    this.logger.log('Seeding default self-hosted workspace...', this.context);

    const user = await this.prisma.user.create({
      data: {
        email: 'admin@localhost',
        firstName: 'Admin',
        handle: 'admin',
        isDefault: true,
        isOnboardingCompleted: true,
      },
    });

    const org = await this.prisma.organization.create({
      data: {
        isDefault: true,
        isSelected: true,
        label: 'Default Workspace',
        onboardingCompleted: true,
        slug: 'default',
        userId: user.id,
      },
    });

    await this.prisma.organizationSetting.create({
      data: {
        isFirstLogin: false,
        organizationId: org.id,
      },
    });

    await this.prisma.brand.create({
      data: {
        backgroundColor: 'transparent',
        description: 'Default brand for self-hosted instance',
        isDefault: true,
        isSelected: true,
        label: 'Default Brand',
        organizationId: org.id,
        primaryColor: '#000000',
        secondaryColor: '#FFFFFF',
        slug: 'default',
        userId: user.id,
      },
    });

    await this.ensureOwnerMembership(org.id, user.id);

    await this.provisionDefaultWorkflows(user.id, org.id);

    this.logger.log(
      `Self-hosted workspace seeded (org=${org.id}, user=${user.id})`,
      this.context,
    );
  }

  private async ensureOwnerMembership(
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const existingMember = await this.prisma.member.findFirst({
      where: {
        isDeleted: false,
        organizationId,
        userId,
      },
    });

    if (existingMember) {
      if (!existingMember.isActive) {
        await this.prisma.member.update({
          data: { isActive: true },
          where: { id: existingMember.id },
        });
      }
      return;
    }

    const role = await this.prisma.role.upsert({
      create: {
        key: MemberRole.OWNER,
        label: 'Owner',
      },
      update: {
        isDeleted: false,
      },
      where: { key: MemberRole.OWNER },
    });

    await this.prisma.member.create({
      data: {
        isActive: true,
        organizationId,
        roleId: role.id,
        roleKey: role.key,
        userId,
      },
    });

    this.logger.log(
      `Created default workspace member (org=${organizationId}, user=${userId}, role=${role.key})`,
      this.context,
    );
  }

  private async provisionDefaultWorkflows(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    try {
      const { WorkflowTemplateSeederService } = await import(
        '@api/collections/workflows/services/workflow-template-seeder.service'
      );
      const workflowSeeder = this.moduleRef.get(WorkflowTemplateSeederService, {
        strict: false,
      });

      await workflowSeeder.ensureDailyTrendsDigestWorkflow(
        userId,
        organizationId,
      );
      await workflowSeeder.ensureAdAutomationWorkflows(userId, organizationId);
      await workflowSeeder.ensureCampaignOrchestrationWorkflows(
        userId,
        organizationId,
      );
      await workflowSeeder.ensureAgentAutopilotWorkflows(
        userId,
        organizationId,
      );
      await workflowSeeder.ensureAnalyticsSyncWorkflows(userId, organizationId);
      await workflowSeeder.ensureContentProductionWorkflows(
        userId,
        organizationId,
      );
      await workflowSeeder.ensureReplyPollingWorkflows(userId, organizationId);
      await workflowSeeder.ensureTrendNotificationWorkflows(
        userId,
        organizationId,
      );
      await workflowSeeder.ensureLivestreamBotWorkflows(userId, organizationId);
      await workflowSeeder.ensureSystemActionWorkflows(userId, organizationId);

      // Seeded schedules fire via BullMQ job schedulers; register them now so
      // they don't wait for the next service restart.
      await workflowSeeder.syncOrganizationWorkflowSchedulers(organizationId);
    } catch (error) {
      this.logger.error(
        'Failed to provision default self-hosted workflows',
        error,
        this.context,
      );
    }
  }
}
