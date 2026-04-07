/**
 * Self-Hosted Seed Service
 * Creates the default workspace (User, Organization, Brand, OrganizationSetting)
 * on first application boot when running in self-hosted mode.
 *
 * Idempotent: skips seeding if a default organization already exists.
 * Uses Model.create() to avoid triggering post-save hooks.
 */

import {
  Brand,
  type BrandDocument,
} from '@api/collections/brands/schemas/brand.schema';
import {
  OrganizationSetting,
  type OrganizationSettingDocument,
} from '@api/collections/organization-settings/schemas/organization-setting.schema';
import {
  Organization,
  type OrganizationDocument,
} from '@api/collections/organizations/schemas/organization.schema';
import {
  User,
  type UserDocument,
} from '@api/collections/users/schemas/user.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { IS_SELF_HOSTED } from '@genfeedai/config';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, Types } from 'mongoose';

@Injectable()
export class SelfHostedSeedService implements OnApplicationBootstrap {
  private readonly context = 'SelfHostedSeedService';

  constructor(
    @InjectModel(User.name, DB_CONNECTIONS.AUTH)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Organization.name, DB_CONNECTIONS.AUTH)
    private readonly organizationModel: Model<OrganizationDocument>,
    @InjectModel(OrganizationSetting.name, DB_CONNECTIONS.AUTH)
    private readonly organizationSettingModel: Model<OrganizationSettingDocument>,
    @InjectModel(Brand.name, DB_CONNECTIONS.CLOUD)
    private readonly brandModel: Model<BrandDocument>,
    private readonly logger: LoggerService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!IS_SELF_HOSTED) {
      return;
    }

    const existingOrg = await this.organizationModel
      .findOne({ isDefault: true })
      .lean()
      .exec();

    if (existingOrg) {
      this.logger.log(
        'Default workspace already exists — skipping seed',
        this.context,
      );
      return;
    }

    this.logger.log('Seeding default self-hosted workspace...', this.context);

    const userId = new Types.ObjectId();
    const orgId = new Types.ObjectId();
    const brandId = new Types.ObjectId();
    const settingsId = new Types.ObjectId();

    await this.userModel.create({
      _id: userId,
      handle: 'admin',
      email: 'admin@localhost',
      firstName: 'Admin',
      isDefault: true,
      isOnboardingCompleted: true,
    });

    await this.organizationModel.create({
      _id: orgId,
      user: userId,
      label: 'Default Workspace',
      slug: 'default',
      isDefault: true,
      isSelected: true,
      onboardingCompleted: true,
    });

    await this.organizationSettingModel.create({
      _id: settingsId,
      organization: orgId,
      isFirstLogin: false,
    });

    await this.brandModel.create({
      _id: brandId,
      user: userId,
      organization: orgId,
      slug: 'default',
      label: 'Default Brand',
      description: 'Default brand for self-hosted instance',
      isSelected: true,
      isDefault: true,
      primaryColor: '#000000',
      secondaryColor: '#FFFFFF',
      backgroundColor: 'transparent',
    });

    this.logger.log(
      `Self-hosted workspace seeded (org=${orgId.toHexString()}, brand=${brandId.toHexString()})`,
      this.context,
    );
  }
}
