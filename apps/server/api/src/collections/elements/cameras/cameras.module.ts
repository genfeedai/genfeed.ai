/**
 * Cameras Module
 * Camera angle presets: shot types, camera movements, perspective settings,
and cinematography configurations.
 */
import { ElementsCamerasController } from '@api/collections/elements/cameras/controllers/cameras.controller';
import {
  ElementCamera,
  ElementCameraSchema,
} from '@api/collections/elements/cameras/schemas/camera.schema';
import { ElementsCamerasService } from '@api/collections/elements/cameras/services/cameras.service';
import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [ElementsCamerasController],
  exports: [ElementsCamerasService],
  imports: [
    MongooseModule.forFeatureAsync(
      [
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: ElementCamera.name,
          useFactory: () => {
            const schema = ElementCameraSchema;

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
  providers: [ElementsCamerasService],
})
export class ElementsCamerasModule {}
