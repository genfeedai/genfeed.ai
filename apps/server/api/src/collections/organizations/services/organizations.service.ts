import { CreateOrganizationDto } from '@api/collections/organizations/dto/create-organization.dto';
import { UpdateOrganizationDto } from '@api/collections/organizations/dto/update-organization.dto';
import {
  Organization,
  type OrganizationDocument,
} from '@api/collections/organizations/schemas/organization.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class OrganizationsService extends BaseService<
  OrganizationDocument,
  CreateOrganizationDto,
  UpdateOrganizationDto
> {
  private readonly populate = [
    // NOTE: logo and banner are Asset documents on the 'cloud' DB connection.
    // Organization is on 'auth' — Mongoose cannot populate across connections.
    // Logo/banner are fetched separately via asset lookups where needed.
    {
      path: 'settings',
      select: [
        '_id',
        'isWhitelabelEnabled',
        'isVoiceControlEnabled',
        'isWatermarkEnabled',
        'isVerifyScriptEnabled',
        'isVerifyIngredientEnabled',
        'isVerifyVideoEnabled',
        'isGenerateVideosEnabled',
        'isGenerateArticlesEnabled',
        'isGenerateImagesEnabled',
        'isGenerateMusicEnabled',
        'isNotificationsDiscordEnabled',
        'isNotificationsTelegramEnabled',
        'isNotificationsEmailEnabled',
        'seatsLimit',
        'brandsLimit',
        'timezone',
        'isWebhookEnabled',
        'webhookEndpoint',
        'webhookSecret',
        'quotaYoutube',
        'quotaTiktok',
        'quotaTwitter',
        'quotaInstagram',
        'enabledModels',
      ].join(' '),
    },
    { path: 'credits', select: '_id balance' },
  ];

  constructor(
    @InjectModel(Organization.name, DB_CONNECTIONS.AUTH)
    model: AggregatePaginateModel<OrganizationDocument>,
    logger: LoggerService,
  ) {
    super(model, logger);
  }

  create(createDto: CreateOrganizationDto): Promise<OrganizationDocument> {
    return super.create(createDto, this.populate);
  }

  findOne(
    params: Record<string, unknown>,
  ): Promise<OrganizationDocument | null> {
    return super.findOne(params, this.populate);
  }

  patch(
    id: string,
    updateDto: Partial<UpdateOrganizationDto>,
  ): Promise<OrganizationDocument> {
    return super.patch(id, updateDto, this.populate);
  }

  /**
   * Count organizations matching filter
   */
  count(filter: Record<string, unknown>): Promise<number> {
    return this.model.countDocuments(filter as never);
  }

  /**
   * Find an organization by its unique prefix (case-insensitive via collation)
   */
  findByPrefix(prefix: string): Promise<OrganizationDocument | null> {
    return this.findOne({
      isDeleted: false,
      prefix: prefix.toUpperCase(),
    });
  }

  /**
   * Check if a prefix is already taken
   */
  async isPrefixAvailable(prefix: string): Promise<boolean> {
    const count = await this.count({
      isDeleted: false,
      prefix: prefix.toUpperCase(),
    });
    return count === 0;
  }

  /**
   * Generate a URL-friendly slug from a label
   */
  generateSlug(label: string): string {
    return label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Find an organization by its slug
   */
  async findBySlug(slug: string): Promise<OrganizationDocument | null> {
    return this.model
      .findOne({ isDeleted: false, slug })
      .populate(this.populate)
      .exec();
  }

  /**
   * Generate a unique slug, appending a counter if needed.
   * Pass `excludeOrgId` when updating an existing org's slug to avoid
   * treating the org's own current slug as a collision.
   */
  async generateUniqueSlug(
    label: string,
    excludeOrgId?: string,
  ): Promise<string> {
    const base = this.generateSlug(label);
    if (base.length < 2) {
      throw new BadRequestException('Label too short to generate a valid slug');
    }
    let candidate = base;
    let counter = 2;
    while (true) {
      const filter: Record<string, unknown> = {
        isDeleted: false,
        slug: candidate,
      };
      if (excludeOrgId) {
        filter._id = { $ne: excludeOrgId };
      }
      if (!(await this.model.exists(filter))) {
        break;
      }
      candidate = `${base}-${counter}`;
      counter++;
    }
    return candidate;
  }

  /**
   * Get the default GetShareable organization
   * Used for assigning getshareable.app users to a shared organization
   */
  getGetShareableOrganization(): Promise<OrganizationDocument | null> {
    return this.findOne({
      isDeleted: false,
      label: 'GetShareable',
    });
  }
}
