/**
 * Tags Module
 * Tagging system: create tags, manage tag categories, tag-based filtering,
and tag auto-suggestions.
 */
import { TagsController } from '@api/collections/tags/controllers/tags.controller';
import { Tag, TagSchema } from '@api/collections/tags/schemas/tag.schema';
import { TagsService } from '@api/collections/tags/services/tags.service';
import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [TagsController],
  exports: [MongooseModule, TagsService],
  imports: [
    MongooseModule.forFeatureAsync(
      [
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: Tag.name,
          useFactory: () => {
            const schema = TagSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            // Index for organization-scoped tags (allows null for global tags)
            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Index for global tags querying (no organization, not deleted)
            schema.index(
              { createdAt: -1, isDeleted: 1 },
              {
                partialFilterExpression: {
                  isDeleted: false,
                  organization: null,
                },
              },
            );

            // Unique key per organization (sparse because key is optional)
            // Allows same key across different organizations, but unique within org
            // Global tags (no org) can have same key as org-scoped tags
            schema.index(
              { key: 1, organization: 1 },
              {
                partialFilterExpression: {
                  key: { $exists: true, $ne: null },
                  organization: { $exists: true, $ne: null },
                },
                sparse: true,
                unique: true,
              },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [TagsService],
})
export class TagsModule {}
