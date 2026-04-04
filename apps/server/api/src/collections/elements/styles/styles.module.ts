/**
 * Styles Module
 * Visual style presets: color schemes, artistic styles, visual themes,
and style application to generated content.
 */
import { ElementsStylesController } from '@api/collections/elements/styles/controllers/styles.controller';
import {
  ElementStyle,
  ElementStyleSchema,
} from '@api/collections/elements/styles/schemas/style.schema';
import { ElementsStylesService } from '@api/collections/elements/styles/services/styles.service';
import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [ElementsStylesController],
  exports: [ElementsStylesService],
  imports: [
    MongooseModule.forFeatureAsync(
      [
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: ElementStyle.name,
          useFactory: () => {
            const schema = ElementStyleSchema;

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
  providers: [ElementsStylesService],
})
export class ElementsStylesModule {}
