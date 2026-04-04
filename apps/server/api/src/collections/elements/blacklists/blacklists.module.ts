/**
 * Blacklists Module
 * Content filtering: manage blacklists, filter inappropriate content,
and content moderation rules.
 */
import { ElementsBlacklistsController } from '@api/collections/elements/blacklists/controllers/blacklists.controller';
import {
  ElementBlacklist,
  ElementBlacklistSchema,
} from '@api/collections/elements/blacklists/schemas/blacklist.schema';
import { ElementsBlacklistsService } from '@api/collections/elements/blacklists/services/blacklists.service';
import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [ElementsBlacklistsController],
  exports: [ElementsBlacklistsService],
  imports: [
    MongooseModule.forFeatureAsync(
      [
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: ElementBlacklist.name,
          useFactory: () => {
            const schema = ElementBlacklistSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            schema.index({ category: 1, value: 1 });

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [ElementsBlacklistsService],
})
export class ElementsBlacklistsModule {}
