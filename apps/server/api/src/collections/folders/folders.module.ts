/**
 * Folders Module
 * Content organization: folder structure, hierarchical organization,
content categorization, and folder permissions.
 */
import { FoldersController } from '@api/collections/folders/controllers/folders.controller';
import {
  Folder,
  FolderSchema,
} from '@api/collections/folders/schemas/folder.schema';
import { FoldersService } from '@api/collections/folders/services/folders.service';
import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [FoldersController],
  exports: [FoldersService],
  imports: [
    MongooseModule.forFeatureAsync(
      [
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: Folder.name,
          useFactory: () => {
            const schema = FolderSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Parent-child hierarchical queries
            schema.index(
              { isDeleted: 1, organization: 1, parent: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [FoldersService],
})
export class FoldersModule {}
