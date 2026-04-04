/**
 * Announcements Collection Module
 * Global admin announcements: changelog, BIP posts, AI news.
 * Published to Discord and/or Twitter/X channels.
 */
import {
  Announcement,
  AnnouncementSchema,
} from '@api/collections/announcements/schemas/announcement.schema';
import { AnnouncementsService } from '@api/collections/announcements/services/announcements.service';
import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  exports: [AnnouncementsService],
  imports: [
    MongooseModule.forFeatureAsync(
      [
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: Announcement.name,
          useFactory: () => {
            const schema = AnnouncementSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            // Compound index for listing by creation date
            schema.index(
              { createdAt: -1, isDeleted: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [AnnouncementsService],
})
export class AnnouncementsCollectionModule {}
