/**
 * Self-Hosted Seed Service
 * Creates the default workspace (User, Organization, Brand, OrganizationSetting)
 * on first application boot when running in self-hosted mode.
 *
 * Idempotent: skips seeding if a default organization already exists.
 */

import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { IS_SELF_HOSTED } from '@genfeedai/config';
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
    if (!IS_SELF_HOSTED) {
      return;
    }

    const existingOrg = await this.prisma.organization.findFirst({
      where: { isDefault: true },
    });

    if (existingOrg) {
      this.logger.log(
        'Default workspace already exists — skipping seed',
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

    this.logger.log(
      `Self-hosted workspace seeded (org=${org.id}, user=${user.id})`,
      this.context,
    );
  }
}
