import type {
  AdBulkUploadJobDocument,
  BulkUploadError,
  BulkUploadStatus,
} from '@api/collections/ad-bulk-upload-jobs/schemas/ad-bulk-upload-job.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isBulkUploadStatus(value: unknown): value is BulkUploadStatus {
  return (
    typeof value === 'string' &&
    [
      'pending',
      'processing',
      'completed',
      'failed',
      'cancelled',
      'partial',
    ].includes(value)
  );
}

@Injectable()
export class AdBulkUploadJobsService {
  private readonly constructorName = this.constructor.name;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  private toJsonValue(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
  }

  private normalizeJob(
    record: Record<string, unknown>,
  ): AdBulkUploadJobDocument {
    const data = isPlainObject(record.data) ? record.data : {};
    const merged = { ...record, ...data };
    const uploadErrors = Array.isArray(merged.uploadErrors)
      ? merged.uploadErrors.flatMap((entry) => {
          if (
            !isPlainObject(entry) ||
            typeof entry.message !== 'string' ||
            typeof entry.permutationIndex !== 'number'
          ) {
            return [];
          }

          const timestamp =
            entry.timestamp instanceof Date ||
            typeof entry.timestamp === 'string'
              ? entry.timestamp
              : new Date().toISOString();

          return [
            {
              message: entry.message,
              permutationIndex: entry.permutationIndex,
              timestamp,
            } satisfies BulkUploadError,
          ];
        })
      : [];

    return {
      ...(record as unknown as AdBulkUploadJobDocument),
      _id:
        typeof record.mongoId === 'string' && record.mongoId.length > 0
          ? record.mongoId
          : String(record.id ?? ''),
      brand: typeof record.brandId === 'string' ? record.brandId : undefined,
      completedPermutations:
        typeof merged.completedPermutations === 'number'
          ? merged.completedPermutations
          : 0,
      credential:
        typeof record.credentialId === 'string'
          ? record.credentialId
          : undefined,
      data,
      failedPermutations:
        typeof merged.failedPermutations === 'number'
          ? merged.failedPermutations
          : 0,
      organization:
        typeof record.organizationId === 'string'
          ? record.organizationId
          : undefined,
      status: isBulkUploadStatus(merged.status) ? merged.status : 'pending',
      totalPermutations:
        typeof merged.totalPermutations === 'number'
          ? merged.totalPermutations
          : 0,
      uploadErrors,
    };
  }

  private async updateJobData(
    jobId: string,
    updater: (
      currentData: Record<string, unknown>,
      currentJob: AdBulkUploadJobDocument | null,
    ) => Record<string, unknown>,
  ): Promise<void> {
    const existing = await this.prisma.adBulkUploadJob.findUnique({
      where: { id: jobId },
    });
    const normalized = existing
      ? this.normalizeJob(existing as Record<string, unknown>)
      : null;
    const nextData = updater({ ...(normalized?.data ?? {}) }, normalized);

    await this.prisma.adBulkUploadJob.update({
      data: {
        data: this.toJsonValue(nextData),
      },
      where: { id: jobId },
    });
  }

  async create(
    data: Record<string, unknown>,
  ): Promise<AdBulkUploadJobDocument> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const organizationId = data.organizationId ?? data.organization;
    const brandId = data.brandId ?? data.brand;
    const credentialId = data.credentialId ?? data.credential;

    try {
      const doc = await this.prisma.adBulkUploadJob.create({
        data: {
          brandId: typeof brandId === 'string' ? brandId : undefined,
          credentialId:
            typeof credentialId === 'string' ? credentialId : undefined,
          data: this.toJsonValue(
            Object.fromEntries(
              Object.entries(data).filter(
                ([key, value]) =>
                  value !== undefined &&
                  ![
                    'brand',
                    'brandId',
                    'credential',
                    'credentialId',
                    'organization',
                    'organizationId',
                  ].includes(key),
              ),
            ),
          ),
          organizationId: String(organizationId ?? ''),
        },
      });
      this.logger.log(`${caller} created bulk upload job ${doc.id}`);
      return this.normalizeJob(doc as Record<string, unknown>);
    } catch (error: unknown) {
      this.logger.error(`${caller} failed`, error);
      throw error;
    }
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<AdBulkUploadJobDocument | null> {
    const job = await this.prisma.adBulkUploadJob.findFirst({
      where: {
        id,
        isDeleted: false,
        organizationId,
      },
    });

    return job ? this.normalizeJob(job as Record<string, unknown>) : null;
  }

  async findByOrganization(
    organizationId: string,
    params?: {
      status?: BulkUploadStatus;
      limit?: number;
      offset?: number;
    },
  ): Promise<AdBulkUploadJobDocument[]> {
    const jobs = await this.prisma.adBulkUploadJob.findMany({
      orderBy: { createdAt: 'desc' },
      where: {
        isDeleted: false,
        organizationId,
      },
    });
    const offset = params?.offset ?? 0;
    const limit = params?.limit ?? 50;

    return jobs
      .map((job) => this.normalizeJob(job as Record<string, unknown>))
      .filter((job) => !params?.status || job.status === params.status)
      .slice(offset, offset + limit);
  }

  async incrementProgress(
    jobId: string,
    field: 'completedPermutations' | 'failedPermutations',
  ): Promise<void> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      await this.updateJobData(jobId, (currentData, currentJob) => ({
        ...currentData,
        [field]:
          typeof currentJob?.[field] === 'number' ? currentJob[field] + 1 : 1,
      }));
    } catch (error: unknown) {
      this.logger.error(`${caller} failed for job ${jobId}`, error);
      throw error;
    }
  }

  async updateStatus(jobId: string, status: BulkUploadStatus): Promise<void> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      await this.updateJobData(jobId, (currentData) => ({
        ...currentData,
        status,
      }));

      this.logger.log(`${caller} updated job ${jobId} status to ${status}`);
    } catch (error: unknown) {
      this.logger.error(`${caller} failed for job ${jobId}`, error);
      throw error;
    }
  }

  async addError(jobId: string, error: BulkUploadError): Promise<void> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      await this.updateJobData(jobId, (currentData, currentJob) => ({
        ...currentData,
        uploadErrors: [
          ...(currentJob?.uploadErrors ?? []),
          {
            ...error,
            timestamp:
              error.timestamp instanceof Date
                ? error.timestamp.toISOString()
                : error.timestamp,
          },
        ],
      }));
    } catch (dbError: unknown) {
      this.logger.error(`${caller} failed for job ${jobId}`, dbError);
      throw dbError;
    }
  }
}
