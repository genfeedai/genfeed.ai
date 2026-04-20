import { CreateOrganizationDto } from '@api/collections/organizations/dto/create-organization.dto';
import { UpdateOrganizationDto } from '@api/collections/organizations/dto/update-organization.dto';
import type { OrganizationDocument } from '@api/collections/organizations/schemas/organization.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class OrganizationsService extends BaseService<
  OrganizationDocument,
  CreateOrganizationDto,
  UpdateOrganizationDto
> {
  private readonly populate = [
    // NOTE: logo and banner live in the 'cloud' database while Organization is
    // stored in 'auth', so those relations are fetched separately where needed.
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
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'organization', logger);
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
    return this.prisma.organization.count({ where: filter as never });
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
    return this.findOne({ isDeleted: false, slug });
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
      if (
        !(await this.prisma.organization.findFirst({ where: filter as never }))
      ) {
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
