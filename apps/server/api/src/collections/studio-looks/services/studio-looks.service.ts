import type { CreateStudioLookDto } from '@api/collections/studio-looks/dto/create-studio-look.dto';
import type { UpdateStudioLookDto } from '@api/collections/studio-looks/dto/update-studio-look.dto';
import type { StudioLookDocument } from '@api/collections/studio-looks/schemas/studio-look.schema';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import type { StudioLookAssetType } from '@genfeedai/contracts/interfaces';
import type { AggregationOptions } from '@libs/interfaces/query.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export interface StudioLookRequestScope {
  brandId: string;
  organizationId: string;
  userId: string;
}

@Injectable()
export class StudioLooksService extends BaseService<StudioLookDocument> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'studioLook', logger);
  }

  listScoped(
    scope: StudioLookRequestScope,
    assetType: StudioLookAssetType | undefined,
    options: AggregationOptions,
  ): Promise<AggregatePaginateResult<StudioLookDocument>> {
    return this.findAll(
      {
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        where: {
          organizationId: scope.organizationId,
          brandId: scope.brandId,
          isDeleted: false,
          ...(assetType ? { assetType } : {}),
        },
      },
      options,
      false,
    );
  }

  async createScoped(
    dto: CreateStudioLookDto,
    scope: StudioLookRequestScope,
  ): Promise<StudioLookDocument> {
    const brand = await this.prisma.brand.findFirst({
      select: { id: true },
      where: scopedWhere(scope.organizationId, { id: scope.brandId }),
    });
    if (!brand) {
      throw new NotFoundException('Brand', scope.brandId);
    }

    return await this.prisma.studioLook.create({
      data: {
        ...this.toCreateData(dto),
        brandId: scope.brandId,
        organizationId: scope.organizationId,
        userId: scope.userId,
      },
    });
  }

  async updateScoped(
    id: string,
    dto: UpdateStudioLookDto,
    scope: StudioLookRequestScope,
  ): Promise<StudioLookDocument | null> {
    const existing = await this.prisma.studioLook.findFirst({
      where: scopedWhere(scope.organizationId, {
        brandId: scope.brandId,
        id,
      }),
    });
    if (!existing) {
      return null;
    }

    const assetType = dto.assetType ?? existing.assetType;
    const data = {
      ...dto,
      ...(assetType === 'video' ? {} : { cameraMovement: null }),
    };

    const { count } = await this.prisma.studioLook.updateMany({
      data,
      where: scopedWhere(scope.organizationId, {
        brandId: scope.brandId,
        id,
      }),
    });
    if (count === 0) {
      return null;
    }

    return await this.prisma.studioLook.findFirst({
      where: scopedWhere(scope.organizationId, {
        brandId: scope.brandId,
        id,
      }),
    });
  }

  async removeScoped(
    id: string,
    scope: StudioLookRequestScope,
  ): Promise<boolean> {
    const { count } = await this.prisma.studioLook.updateMany({
      data: { isDeleted: true },
      where: scopedWhere(scope.organizationId, {
        brandId: scope.brandId,
        id,
      }),
    });

    return count > 0;
  }

  private toCreateData(dto: CreateStudioLookDto) {
    return {
      ...dto,
      cameraMovement:
        dto.assetType === 'video' ? (dto.cameraMovement ?? '') : null,
    };
  }
}
