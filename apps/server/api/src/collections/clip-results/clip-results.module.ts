import { ClipResultsController } from '@api/collections/clip-results/clip-results.controller';
import { ClipResultsService } from '@api/collections/clip-results/clip-results.service';
import {
  ClipResult,
  ClipResultSchema,
} from '@api/collections/clip-results/schemas/clip-result.schema';
import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [ClipResultsController],
  exports: [MongooseModule, ClipResultsService],
  imports: [
    MongooseModule.forFeatureAsync(
      [
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: ClipResult.name,
          useFactory: () => {
            const schema = ClipResultSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              { isDeleted: 1, project: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            schema.index(
              { isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            schema.index({ viralityScore: -1 });

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLIPS,
    ),
  ],
  providers: [ClipResultsService],
})
export class ClipResultsModule {}
