import type {
  BulkUploadError,
  BulkUploadStatus,
} from '@api/collections/ad-bulk-upload-jobs/schemas/ad-bulk-upload-job.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AdBulkUploadJobsService {
  private readonly constructorName = this.constructor.name;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async create(
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const doc = await this.prisma.adBulkUploadJob.create({
        data: data as never,
      });
      this.logger.log(`${caller} created bulk upload job ${doc.id}`);
      return doc;
    } catch (error: unknown) {
      this.logger.error(`${caller} failed`, error);
      throw error;
    }
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<Record<string, unknown> | null> {
    return this.prisma.adBulkUploadJob.findFirst({
      where: {
        id,
        isDeleted: false,
        organizationId,
      },
    });
  }

  async findByOrganization(
    organizationId: string,
    params?: {
      status?: BulkUploadStatus;
      limit?: number;
      offset?: number;
    },
  ): Promise<Record<string, unknown>[]> {
    return this.prisma.adBulkUploadJob.findMany({
      orderBy: { createdAt: 'desc' },
      skip: params?.offset ?? 0,
      take: params?.limit ?? 50,
      where: {
        isDeleted: false,
        organizationId,
        ...(params?.status ? { status: params.status } : {}),
      },
    });
  }

  async incrementProgress(
    jobId: string,
    field: 'completedPermutations' | 'failedPermutations',
  ): Promise<void> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      await this.prisma.adBulkUploadJob.update({
        data: { [field]: { increment: 1 } },
        where: { id: jobId },
      });
    } catch (error: unknown) {
      this.logger.error(`${caller} failed for job ${jobId}`, error);
      throw error;
    }
  }

  async updateStatus(jobId: string, status: BulkUploadStatus): Promise<void> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      await this.prisma.adBulkUploadJob.update({
        data: { status },
        where: { id: jobId },
      });

      this.logger.log(`${caller} updated job ${jobId} status to ${status}`);
    } catch (error: unknown) {
      this.logger.error(`${caller} failed for job ${jobId}`, error);
      throw error;
    }
  }

  async addError(jobId: string, error: BulkUploadError): Promise<void> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const job = await this.prisma.adBulkUploadJob.findUnique({
        where: { id: jobId },
      });
      const existing = job as Record<string, unknown> | null;
      const uploadErrors = Array.isArray(existing?.['uploadErrors'])
        ? existing!['uploadErrors']
        : [];
      await this.prisma.adBulkUploadJob.update({
        data: { uploadErrors: [...uploadErrors, error] as never },
        where: { id: jobId },
      });
    } catch (dbError: unknown) {
      this.logger.error(`${caller} failed for job ${jobId}`, dbError);
      throw dbError;
    }
  }
}
