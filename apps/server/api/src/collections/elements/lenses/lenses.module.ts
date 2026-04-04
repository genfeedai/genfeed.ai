import { ElementsLensesController } from '@api/collections/elements/lenses/controllers/lenses.controller';
import {
  ElementLens,
  ElementLensSchema,
} from '@api/collections/elements/lenses/schemas/lens.schema';
import { ElementsLensesService } from '@api/collections/elements/lenses/services/lenses.service';
import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [ElementsLensesController],
  exports: [ElementsLensesService],
  imports: [
    MongooseModule.forFeatureAsync(
      [
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: ElementLens.name,
          useFactory: () => {
            const schema = ElementLensSchema;

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
  providers: [ElementsLensesService],
})
export class ElementsLensesModule {}
