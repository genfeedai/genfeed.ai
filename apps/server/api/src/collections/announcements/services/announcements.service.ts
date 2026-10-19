import type { AnnouncementDocument } from '@api/collections/announcements/schemas/announcement.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import { type Announcement } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AnnouncementsService extends BaseService<
  AnnouncementDocument,
  Partial<Announcement>,
  Partial<Announcement>
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'announcement', logger);
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
   * One page of announcements, newest first (no org filter — global/admin
   * data). Paged in the database with the total count.
   */
  getAll(
    page: number,
    limit: number,
  ): Promise<AggregatePaginateResult<AnnouncementDocument>> {
    return this.findAll(
      { where: {} },
      { limit, page, sort: { createdAt: -1 } },
    );
  }
}
