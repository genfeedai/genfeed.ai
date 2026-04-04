/**
 * Links Module
 * URL management: link tracking, short URLs, link analytics,
and QR code generation.
 */
import { LinksController } from '@api/collections/links/controllers/links.controller';
import { Link, LinkSchema } from '@api/collections/links/schemas/link.schema';
import { LinksService } from '@api/collections/links/services/links.service';
import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [LinksController],
  exports: [MongooseModule, LinksService],
  imports: [
    MongooseModule.forFeatureAsync(
      [
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: Link.name,
          useFactory: () => {
            const schema = LinkSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Brand-scoped link queries
            schema.index(
              { brand: 1, createdAt: -1, isDeleted: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            schema.index(
              { brand: 1, category: 1, url: 1 },
              { partialFilterExpression: { isDeleted: false }, unique: true },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [LinksService],
})
export class LinksModule {}
