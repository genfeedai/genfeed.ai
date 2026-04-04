import {
  AdBulkUploadJob,
  type AdBulkUploadJobDocument,
  type BulkUploadError,
  type BulkUploadStatus,
} from '@api/collections/ad-bulk-upload-jobs/schemas/ad-bulk-upload-job.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Types } from 'mongoose';

@Injectable()
export class AdBulkUploadJobsService {
  private readonly constructorName = this.constructor.name;

  constructor(
    @InjectModel(AdBulkUploadJob.name, DB_CONNECTIONS.CLOUD)
    private readonly adBulkUploadJobModel: Model<AdBulkUploadJobDocument>,
    private readonly logger: LoggerService,
  ) {}

  async create(
    data: Partial<AdBulkUploadJob>,
  ): Promise<AdBulkUploadJobDocument> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const doc = await this.adBulkUploadJobModel.create(data);
      this.logger.log(`${caller} created bulk upload job ${String(doc._id)}`);
      return doc;
    } catch (error: unknown) {
      this.logger.error(`${caller} failed`, error);
      throw error;
    }
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<AdBulkUploadJobDocument | null> {
    return this.adBulkUploadJobModel
      .findOne({
        _id: new Types.ObjectId(id),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      })
      .lean()
      .exec();
  }

  async findByOrganization(
    organizationId: string,
    params?: {
      status?: BulkUploadStatus;
      limit?: number;
      offset?: number;
    },
  ): Promise<AdBulkUploadJobDocument[]> {
    const query: Record<string, unknown> = {
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    };

    if (params?.status) query.status = params.status;

    return this.adBulkUploadJobModel
      .find(query)
      .sort({ createdAt: -1 })
      .skip(params?.offset || 0)
      .limit(params?.limit || 50)
      .lean()
      .exec();
  }

  async incrementProgress(
    jobId: string,
    field: 'completedPermutations' | 'failedPermutations',
  ): Promise<void> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      await this.adBulkUploadJobModel
        .updateOne({ _id: new Types.ObjectId(jobId) }, { $inc: { [field]: 1 } })
        .exec();
    } catch (error: unknown) {
      this.logger.error(`${caller} failed for job ${jobId}`, error);
      throw error;
    }
  }

  async updateStatus(jobId: string, status: BulkUploadStatus): Promise<void> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      await this.adBulkUploadJobModel
        .updateOne({ _id: new Types.ObjectId(jobId) }, { $set: { status } })
        .exec();

      this.logger.log(`${caller} updated job ${jobId} status to ${status}`);
    } catch (error: unknown) {
      this.logger.error(`${caller} failed for job ${jobId}`, error);
      throw error;
    }
  }

  async addError(jobId: string, error: BulkUploadError): Promise<void> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      await this.adBulkUploadJobModel
        .updateOne(
          { _id: new Types.ObjectId(jobId) },
          { $push: { uploadErrors: error } },
        )
        .exec();
    } catch (dbError: unknown) {
      this.logger.error(`${caller} failed for job ${jobId}`, dbError);
      throw dbError;
    }
  }
}
