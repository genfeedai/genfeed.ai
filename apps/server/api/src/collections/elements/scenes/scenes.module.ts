/**
 * Scenes Module
 * Scene configurations: background settings, environmental presets,
scene composition, and scene templates.
 */
import { ElementsScenesController } from '@api/collections/elements/scenes/controllers/scenes.controller';
import {
  ElementScene,
  ElementSceneSchema,
} from '@api/collections/elements/scenes/schemas/scene.schema';
import { ElementsScenesService } from '@api/collections/elements/scenes/services/scenes.service';
import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [ElementsScenesController],
  exports: [ElementsScenesService],
  imports: [
    MongooseModule.forFeatureAsync(
      [
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: ElementScene.name,
          useFactory: () => {
            const schema = ElementSceneSchema;

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
  providers: [ElementsScenesService],
})
export class ElementsScenesModule {}
