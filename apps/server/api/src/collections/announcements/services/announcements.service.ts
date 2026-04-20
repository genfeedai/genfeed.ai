import type { AnnouncementDocument } from '@api/collections/announcements/schemas/announcement.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
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
   * Get all announcements ordered by newest first (no org filter — global/admin data)
   */
  async getAll(): Promise<AnnouncementDocument[]> {
    const result = await this.findAll([], { limit: 200, page: 1 });
    return result.docs;
  }
}
