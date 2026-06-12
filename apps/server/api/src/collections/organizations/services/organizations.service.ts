import { CreateOrganizationDto } from '@api/collections/organizations/dto/create-organization.dto';
import { UpdateOrganizationDto } from '@api/collections/organizations/dto/update-organization.dto';
import type { OrganizationDocument } from '@api/collections/organizations/schemas/organization.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import type { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

const PRISMA_ORGANIZATION_CATEGORIES = new Set([
  'CREATOR',
  'BUSINESS',
  'AGENCY',
]);

function normalizeOrganizationCategory(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const key = value.toUpperCase();
  if (PRISMA_ORGANIZATION_CATEGORIES.has(key)) {
    return key;
  }

  return value;
}

function normalizeOrganizationCategoryFields<T extends Record<string, unknown>>(
  dto: T,
): T {
  const normalized: Record<string, unknown> = { ...dto };

  if ('category' in normalized) {
    normalized['category'] = normalizeOrganizationCategory(
      normalized['category'],
    );
  }

  if ('accountType' in normalized) {
    normalized['accountType'] = normalizeOrganizationCategory(
      normalized['accountType'],
    );
  }

  return normalized as T;
}

@Injectable()
export class OrganizationsService extends BaseService<
  OrganizationDocument,
  CreateOrganizationDto,
  UpdateOrganizationDto
> {
  private readonly populate = [
    // NOTE: logo and banner live in the 'cloud' database while Organization is
    // stored in 'auth', so those relations are fetched separately where needed.
    // Credit balances are fetched through the dedicated credits services in the
    // Prisma runtime, so keep organization reads limited to relations that
    // actually exist on the model.
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
  ];

  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'organization', logger);
  }

  create(createDto: CreateOrganizationDto): Promise<OrganizationDocument> {
    const normalizedDto = normalizeOrganizationCategoryFields(
      createDto as unknown as Record<string, unknown>,
    ) as unknown as CreateOrganizationDto;

    return super.create(normalizedDto, this.populate);
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
    const normalizedDto = normalizeOrganizationCategoryFields(
      updateDto as Record<string, unknown>,
    ) as Partial<UpdateOrganizationDto>;

    return super.patch(id, normalizedDto, this.populate);
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
      const filter: Prisma.OrganizationWhereInput = {
        isDeleted: false,
        slug: candidate,
      };
      if (excludeOrgId) {
        filter.id = { not: excludeOrgId };
      }
      if (!(await this.prisma.organization.findFirst({ where: filter }))) {
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
