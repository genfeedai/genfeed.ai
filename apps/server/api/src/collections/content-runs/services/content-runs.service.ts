import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ContentRunStatus } from '@genfeedai/enums';
import type {
  CreateContentRunInput,
  UpdateContentRunInput,
} from '@genfeedai/interfaces';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ContentRunsService {
  constructor(private readonly prisma: PrismaService) {}

  createRun(payload: CreateContentRunInput): Promise<Record<string, unknown>> {
    return this.prisma.contentRun.create({
      data: {
        ...payload,
        brandId: payload.brand,
        isDeleted: false,
        organizationId: payload.organization,
      },
    });
  }

  async patchRun(
    organizationId: string,
    runId: string,
    patch: UpdateContentRunInput,
  ): Promise<Record<string, unknown>> {
    const existing = await this.prisma.contentRun.findFirst({
      where: { id: runId, isDeleted: false, organizationId },
    });

    if (!existing) {
      throw new NotFoundException('ContentRun', runId);
    }

    return this.prisma.contentRun.update({
      data: patch,
      where: { id: runId },
    });
  }

  listByBrand(
    organizationId: string,
    brandId: string,
    skillSlug?: string,
    status?: ContentRunStatus,
  ): Promise<Record<string, unknown>[]> {
    return this.prisma.contentRun.findMany({
      orderBy: { createdAt: 'desc' },
      where: {
        brandId,
        isDeleted: false,
        organizationId,
        ...(skillSlug ? { skillSlug } : {}),
        ...(status ? { status } : {}),
      },
    });
  }

  getRunById(
    organizationId: string,
    runId: string,
  ): Promise<Record<string, unknown> | null> {
    return this.prisma.contentRun.findFirst({
      where: {
        id: runId,
        isDeleted: false,
        organizationId,
      },
    });
  }
}
