import { CreateLinkDto } from '@api/collections/links/dto/create-link.dto';
import { UpdateLinkDto } from '@api/collections/links/dto/update-link.dto';
import type { LinkDocument } from '@api/collections/links/schemas/link.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

/** Brand-owned external links (website, social profiles). */
@Traced()
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

  /**
   * True when `brandId` is a live brand of `organizationId`. `model Link` has
   * no organization column, so this is the check that keeps a link inside
   * its caller's organization.
   */
  async isBrandInOrganization(
    brandId: string,
    organizationId: string,
  ): Promise<boolean> {
    const brand = await this.prisma.brand.findFirst({
      select: { id: true },
      where: { id: brandId, isDeleted: false, organizationId },
    });

    return brand !== null;
  }
}
