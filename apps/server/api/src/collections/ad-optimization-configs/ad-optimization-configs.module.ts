import {
  AdOptimizationConfig,
  AdOptimizationConfigSchema,
} from '@api/collections/ad-optimization-configs/schemas/ad-optimization-config.schema';
import { AdOptimizationConfigsService } from '@api/collections/ad-optimization-configs/services/ad-optimization-configs.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  exports: [AdOptimizationConfigsService, MongooseModule],
  imports: [
    MongooseModule.forFeatureAsync(
      [
        {
          name: AdOptimizationConfig.name,
          useFactory: () => {
            const schema = AdOptimizationConfigSchema;

            schema.index(
              { isDeleted: 1, organization: 1 },
              {
                name: 'org_lookup',
                partialFilterExpression: { isDeleted: false },
                unique: true,
              },
            );

            schema.index(
              { isDeleted: 1, isEnabled: 1 },
              {
                name: 'enabled_configs',
                partialFilterExpression: { isDeleted: false, isEnabled: true },
              },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [AdOptimizationConfigsService],
})
export class AdOptimizationConfigsModule {}
