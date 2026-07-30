import { CreateLinkDto } from '@api/collections/links/dto/create-link.dto';
import { UpdateLinkDto } from '@api/collections/links/dto/update-link.dto';
import type { LinkDocument } from '@api/collections/links/schemas/link.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

/**
 * Brand-owned external links (website, social profiles).
 *
 * Create/patch DTOs still use Mongo-era `brand` (session/client alias). Prisma
 * only accepts `brandId` on write — BaseService.normalizeData deliberately does
 * not remap `brand` for tenancy-sensitive models, so Links must do it here.
 */
@Injectable()
export class LinksService extends BaseService<
  LinkDocument,
  CreateLinkDto,
  UpdateLinkDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'link', logger);
  }

  protected override normalizeData(data: unknown): Record<string, unknown> {
    const normalized = super.normalizeData(data);
    if (
      !normalized ||
      typeof normalized !== 'object' ||
      Array.isArray(normalized)
    ) {
      return normalized as Record<string, unknown>;
    }

    const result: Record<string, unknown> = {
      ...(normalized as Record<string, unknown>),
    };

    // Client + enrichCreateDto send `brand`; Prisma column is brandId.
    if (typeof result.brand === 'string' && result.brand.length > 0) {
      if (result.brandId === undefined || result.brandId === null) {
        result.brandId = result.brand;
      }
      delete result.brand;
    }

    return result;
  }
}
