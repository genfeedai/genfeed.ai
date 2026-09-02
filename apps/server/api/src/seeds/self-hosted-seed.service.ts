/**
 * Self-Hosted Seed Service
 * Creates the default workspace (User, Organization, Brand, OrganizationSetting)
 * on first application boot when running in self-hosted mode.
 *
 * Idempotent: creates missing default resources and repairs the owner membership
 * for workspaces created before Member became the authorization source of truth.
 */

import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { isSelfHostedDeployment } from '@genfeedai/config';
import { MemberRole } from '@genfeedai/contracts';
import {
  LOWEST_COST_AGENT_CHAT_MODEL_KEY,
  LOWEST_COST_IMAGE_MODEL_KEY,
  LOWEST_COST_VIDEO_MODEL_KEY,
} from '@genfeedai/contracts/constants';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';

@Injectable()
export class SelfHostedSeedService implements OnApplicationBootstrap {
  private readonly context = 'SelfHostedSeedService';

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!isSelfHostedDeployment()) {
      return;
    }

    const existingOrg = await this.prisma.organization.findFirst({
      where: { isDefault: true },
    });

    if (existingOrg) {
      await this.ensureDefaultRoles();
      await this.ensureOwnerMembership(existingOrg.id, existingOrg.userId);
      await this.ensureLowestCostDefaultModels(existingOrg.id);
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
        defaultImageModel: LOWEST_COST_IMAGE_MODEL_KEY,
        defaultModel: LOWEST_COST_AGENT_CHAT_MODEL_KEY,
        defaultVideoModel: LOWEST_COST_VIDEO_MODEL_KEY,
        isFirstLogin: false,
        organizationId: org.id,
      },
    });

    await this.prisma.brand.create({
      data: {
        backgroundColor: 'transparent',
        defaultImageModel: LOWEST_COST_IMAGE_MODEL_KEY,
        defaultVideoModel: LOWEST_COST_VIDEO_MODEL_KEY,
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

    await this.ensureDefaultRoles();
    await this.ensureOwnerMembership(org.id, user.id);

    this.logger.log(
      `Self-hosted workspace seeded (org=${org.id}, user=${user.id})`,
      this.context,
    );
  }

  /**
   * Fill empty org/brand model defaults with the cheapest curated keys.
   * Does not overwrite an operator-chosen model.
   */
  private async ensureLowestCostDefaultModels(
    organizationId: string,
  ): Promise<void> {
    const setting = await this.prisma.organizationSetting.findFirst({
      where: { organizationId },
    });

    if (setting) {
      const settingPatch = {
        ...(setting.defaultImageModel
          ? {}
          : { defaultImageModel: LOWEST_COST_IMAGE_MODEL_KEY }),
        ...(setting.defaultModel
          ? {}
          : { defaultModel: LOWEST_COST_AGENT_CHAT_MODEL_KEY }),
        ...(setting.defaultVideoModel
          ? {}
          : { defaultVideoModel: LOWEST_COST_VIDEO_MODEL_KEY }),
      };

      if (Object.keys(settingPatch).length > 0) {
        await this.prisma.organizationSetting.update({
          data: settingPatch,
          where: { id: setting.id },
        });
      }
    }

    const brands = await this.prisma.brand.findMany({
      select: {
        defaultImageModel: true,
        defaultVideoModel: true,
        id: true,
      },
      where: { isDeleted: false, organizationId },
    });

    for (const brand of brands) {
      if (brand.defaultImageModel && brand.defaultVideoModel) {
        continue;
      }

      await this.prisma.brand.update({
        data: {
          ...(brand.defaultImageModel
            ? {}
            : { defaultImageModel: LOWEST_COST_IMAGE_MODEL_KEY }),
          ...(brand.defaultVideoModel
            ? {}
            : { defaultVideoModel: LOWEST_COST_VIDEO_MODEL_KEY }),
        },
        where: scopedWhere(organizationId, { id: brand.id }),
      });
    }
  }

  /**
   * Signup member assignment looks up `admin` then `user`. Seeding only
   * `owner` left those keys missing on a fresh self-hosted / E2E database,
   * so UserSetupService could not create the first membership row.
   */
  private async ensureDefaultRoles(): Promise<void> {
    const roles: ReadonlyArray<{ key: MemberRole; label: string }> = [
      { key: MemberRole.OWNER, label: 'Owner' },
      { key: MemberRole.ADMIN, label: 'Admin' },
      { key: MemberRole.USER, label: 'User' },
    ];

    for (const role of roles) {
      await this.prisma.role.upsert({
        create: {
          key: role.key,
          label: role.label,
        },
        update: {
          isDeleted: false,
        },
        where: { key: role.key },
      });
    }
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
}
