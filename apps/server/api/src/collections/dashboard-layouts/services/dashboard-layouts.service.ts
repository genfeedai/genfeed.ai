import type { CreateDashboardLayoutDto } from '@api/collections/dashboard-layouts/dto/create-dashboard-layout.dto';
import type { UpdateDashboardLayoutDto } from '@api/collections/dashboard-layouts/dto/update-dashboard-layout.dto';
import type { UpsertDashboardLayoutDto } from '@api/collections/dashboard-layouts/dto/upsert-dashboard-layout.dto';
import type { DashboardLayoutDocument } from '@api/collections/dashboard-layouts/schemas/dashboard-layout.schema';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { ValidationException } from '@api/helpers/exceptions/http/validation.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { sanitizeLayoutForPersistence } from '@genfeedai/agent/dashboard';
import { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

const DEFAULT_PAGE_KEY = 'workspace-overview';

@Injectable()
export class DashboardLayoutsService extends BaseService<
  DashboardLayoutDocument,
  CreateDashboardLayoutDto,
  UpdateDashboardLayoutDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'dashboardLayout', logger);
  }

  async findForPage(
    brandId: string,
    organizationId: string,
    pageKey: string,
  ): Promise<DashboardLayoutDocument | null> {
    return this.findOne({ brandId, isDeleted: false, organizationId, pageKey });
  }

  async upsertForPage(
    organizationId: string,
    dto: UpsertDashboardLayoutDto,
  ): Promise<DashboardLayoutDocument> {
    // Scope the brand lookup to the caller's organization so a user from one
    // org can neither read nor upsert-create the dashboard layout of a brand
    // owned by another org. Mirrors MoodBoardsService.findOrCreateByBrand.
    const brand = await this.prisma.brand.findFirst({
      select: { organizationId: true },
      where: { id: dto.brandId, isDeleted: false, organizationId },
    });

    if (!brand) {
      throw new NotFoundException('Brand', dto.brandId);
    }

    const { document, issues } = sanitizeLayoutForPersistence(dto.document);

    if (issues.length > 0) {
      this.logger?.warn('Rejected invalid dashboard layout document', {
        brandId: dto.brandId,
        issues,
        organizationId,
      });
      throw new ValidationException(
        'Dashboard layout document failed validation',
        'document',
        issues,
      );
    }

    const pageKey = dto.pageKey ?? DEFAULT_PAGE_KEY;
    // Prisma's Json input type doesn't structurally match our persisted
    // document interface — bridge through `unknown` rather than casting
    // directly, since the two shapes aren't guaranteed assignable.
    const documentJson = document as unknown as Prisma.InputJsonValue;

    const record = await this.prisma.dashboardLayout.upsert({
      create: {
        brandId: dto.brandId,
        document: documentJson,
        organizationId: brand.organizationId,
        pageKey,
        ...(dto.version !== undefined && { version: dto.version }),
      },
      update: {
        document: documentJson,
        // Restore a previously reset (soft-deleted) layout: the compound-unique
        // row still matches, so re-saving must flip isDeleted back to false.
        isDeleted: false,
        ...(dto.version !== undefined && { version: dto.version }),
      },
      where: {
        organizationId_brandId_pageKey: {
          brandId: dto.brandId,
          organizationId,
          pageKey,
        },
      },
    });

    return record as DashboardLayoutDocument;
  }

  async removeScoped(
    id: string,
    organizationId: string,
  ): Promise<DashboardLayoutDocument | null> {
    const existing = await this.findOne({
      id,
      isDeleted: false,
      organizationId,
    });

    if (!existing) {
      return null;
    }

    return this.remove(id);
  }
}
