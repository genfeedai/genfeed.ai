import {
  Announcement,
  type AnnouncementDocument,
} from '@api/collections/announcements/schemas/announcement.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class AnnouncementsService extends BaseService<
  AnnouncementDocument,
  Partial<Announcement>,
  Partial<Announcement>
> {
  constructor(
    @InjectModel(Announcement.name, DB_CONNECTIONS.CLOUD)
    model: AggregatePaginateModel<AnnouncementDocument>,
    logger: LoggerService,
  ) {
    super(model, logger);
  }

  /**
   * Create a new announcement record
   */
  createAnnouncement(
    data: Partial<Announcement>,
  ): Promise<AnnouncementDocument> {
    return this.create(data as Parameters<typeof this.create>[0]);
  }

  /**
   * Get all announcements ordered by newest first (no org filter — global/admin data)
   */
  async getAll(): Promise<AnnouncementDocument[]> {
    const result = await this.findAll(
      [
        { $match: { isDeleted: false } },
        { $sort: { createdAt: -1 } },
        { $limit: 200 },
      ],
      { limit: 200, page: 1 },
    );

    return result.docs;
  }
}
