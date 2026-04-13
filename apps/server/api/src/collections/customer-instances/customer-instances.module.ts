import {
  CustomerInstance,
  CustomerInstanceSchema,
} from '@api/collections/customer-instances/schemas/customer-instance.schema';
import { CustomerInstancesService } from '@api/collections/customer-instances/services/customer-instances.service';
import { ConfigModule } from '@api/config/config.module';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  exports: [MongooseModule, CustomerInstancesService],
  imports: [
    MongooseModule.forFeatureAsync(
      [
        {
          imports: [ConfigModule],
          name: CustomerInstance.name,
          useFactory: () => {
            const schema = CustomerInstanceSchema;
            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              {
                isDeleted: 1,
                organizationId: 1,
                role: 1,
                status: 1,
                tier: 1,
                lastStartedAt: -1,
                createdAt: -1,
              },
              {
                partialFilterExpression: {
                  isDeleted: false,
                  status: 'running',
                },
              },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [CustomerInstancesService],
})
export class CustomerInstancesModule {}
