import { ElementsCameraMovementsController } from '@api/collections/elements/camera-movements/controllers/camera-movements.controller';
import {
  ElementCameraMovement,
  ElementCameraMovementSchema,
} from '@api/collections/elements/camera-movements/schemas/camera-movement.schema';
import { ElementsCameraMovementsService } from '@api/collections/elements/camera-movements/services/camera-movements.service';
import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [ElementsCameraMovementsController],
  exports: [ElementsCameraMovementsService],
  imports: [
    MongooseModule.forFeatureAsync(
      [
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: ElementCameraMovement.name,
          useFactory: () => {
            const schema = ElementCameraMovementSchema;

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
  providers: [ElementsCameraMovementsService],
})
export class ElementsCameraMovementsModule {}
