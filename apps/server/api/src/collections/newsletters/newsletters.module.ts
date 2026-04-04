import { BrandsModule } from '@api/collections/brands/brands.module';
import { NewslettersController } from '@api/collections/newsletters/controllers/newsletters.controller';
import {
  Newsletter,
  NewsletterSchema,
} from '@api/collections/newsletters/schemas/newsletter.schema';
import { NewslettersService } from '@api/collections/newsletters/services/newsletters.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { OpenRouterModule } from '@api/services/integrations/openrouter/openrouter.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [NewslettersController],
  exports: [NewslettersService, MongooseModule],
  imports: [
    forwardRef(() => BrandsModule),
    LoggerModule,
    OpenRouterModule,
    MongooseModule.forFeatureAsync(
      [
        {
          name: Newsletter.name,
          useFactory: () => {
            const schema = NewsletterSchema;
            schema.plugin(mongooseAggregatePaginateV2);
            schema.index(
              { brand: 1, createdAt: -1, isDeleted: 1, organization: 1 },
              { name: 'idx_newsletters_org_brand_created' },
            );
            schema.index(
              {
                brand: 1,
                createdAt: -1,
                isDeleted: 1,
                organization: 1,
                status: 1,
              },
              { name: 'idx_newsletters_org_brand_status_created' },
            );
            schema.index(
              { brand: 1, isDeleted: 1, publishedAt: -1 },
              { name: 'idx_newsletters_brand_published' },
            );
            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [NewslettersService],
})
export class NewslettersModule {}
