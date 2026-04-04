/**
 * Font Families Module
 * Font library: typography management, font families, text styling,
and font pairing recommendations.
 */
import { FontFamiliesController } from '@api/collections/font-families/controllers/font-families.controller';
import {
  FontFamily,
  FontFamilySchema,
} from '@api/collections/font-families/schemas/font-family.schema';
import { FontFamiliesService } from '@api/collections/font-families/services/font-families.service';
import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [FontFamiliesController],
  exports: [FontFamiliesService],
  imports: [
    MongooseModule.forFeatureAsync(
      [
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: FontFamily.name,
          useFactory: () => {
            const schema = FontFamilySchema;

            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [FontFamiliesService],
})
export class FontFamiliesModule {}
