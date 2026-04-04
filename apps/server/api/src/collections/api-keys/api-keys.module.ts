/**
 * Api Keys Module
 * API key management: generate keys, revoke access, key scoping,
and usage monitoring.
 */
import { ApiKeysController } from '@api/collections/api-keys/controllers/api-keys.controller';
import {
  ApiKey,
  ApiKeySchema,
} from '@api/collections/api-keys/schemas/api-key.schema';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [ApiKeysController],
  exports: [ApiKeysService],
  imports: [
    MongooseModule.forFeatureAsync(
      [
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: ApiKey.name,
          useFactory: () => {
            const schema = ApiKeySchema;

            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // For ingredient caption lookups
            schema.index({ isRevoked: 1, key: 1 });

            schema.index({ isRevoked: 1, user: 1 });

            schema.index({ isRevoked: 1, organization: 1 });

            schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.AUTH,
    ),
  ],
  providers: [ApiKeysService],
})
export class ApiKeysModule {}
