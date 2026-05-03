import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ContentRunStatus } from '@genfeedai/enums';
import type {
  CreateContentRunInput,
  UpdateContentRunInput,
} from '@genfeedai/interfaces';
import { Prisma } from '@genfeedai/prisma';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ContentRunsService {
  constructor(private readonly prisma: PrismaService) {}

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private hydrateRun(
    run: Record<string, unknown> | null,
  ): Record<string, unknown> | null {
    if (!run) {
      return null;
    }

    const config = this.isRecord(run.config) ? run.config : {};
    const brand = run.brandId ?? config.brand;
    const organization = run.organizationId ?? config.organization;

    return {
      ...run,
      ...config,
      _id: run.id,
      brand,
      organization,
      status: run.status ?? config.status,
    };
  }

  private hydrateRuns(
    runs: Record<string, unknown>[],
  ): Record<string, unknown>[] {
    return runs.flatMap((run) => {
      const hydrated = this.hydrateRun(run);
      return hydrated ? [hydrated] : [];
    });
  }

  private toJsonValue(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
  }

  async createRun(
    payload: CreateContentRunInput,
  ): Promise<Record<string, unknown>> {
    const { brand, organization, status, ...config } = payload;

    const run = await this.prisma.contentRun.create({
      data: {
        brandId: brand,
        config: this.toJsonValue(config),
        isDeleted: false,
        organizationId: organization,
        status,
      },
    });

    return this.hydrateRun(run as unknown as Record<string, unknown>) ?? run;
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

    const updated = await this.prisma.contentRun.update({
      data: {
        ...(patch.status ? { status: patch.status } : {}),
        config: this.toJsonValue({
          ...(existing.config &&
          typeof existing.config === 'object' &&
          !Array.isArray(existing.config)
            ? existing.config
            : {}),
          ...patch,
        }),
      },
      where: { id: runId },
    });

    return (
      this.hydrateRun(updated as unknown as Record<string, unknown>) ?? updated
    );
  }

  async listByBrand(
    organizationId: string,
    brandId: string,
    skillSlug?: string,
    status?: ContentRunStatus,
  ): Promise<Record<string, unknown>[]> {
    const runs = await this.prisma.contentRun.findMany({
      orderBy: { createdAt: 'desc' },
      where: {
        brandId,
        isDeleted: false,
        organizationId,
        ...(status ? { status } : {}),
      },
    });

    const hydratedRuns = this.hydrateRuns(
      runs as unknown as Record<string, unknown>[],
    );

    if (!skillSlug) {
      return hydratedRuns;
    }

    return hydratedRuns.filter((run) => run.skillSlug === skillSlug);
  }

  async getRunById(
    organizationId: string,
    runId: string,
  ): Promise<Record<string, unknown> | null> {
    const run = await this.prisma.contentRun.findFirst({
      where: {
        id: runId,
        isDeleted: false,
        organizationId,
      },
    });

    return this.hydrateRun(run as unknown as Record<string, unknown> | null);
  }
}
