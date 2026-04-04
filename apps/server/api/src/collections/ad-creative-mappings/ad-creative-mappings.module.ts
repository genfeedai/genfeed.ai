import {
  AdCreativeMapping,
  AdCreativeMappingSchema,
} from '@api/collections/ad-creative-mappings/schemas/ad-creative-mapping.schema';
import { AdCreativeMappingsService } from '@api/collections/ad-creative-mappings/services/ad-creative-mappings.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  exports: [AdCreativeMappingsService, MongooseModule],
  imports: [
    MongooseModule.forFeatureAsync(
      [
        {
          name: AdCreativeMapping.name,
          useFactory: () => {
            const schema = AdCreativeMappingSchema;

            schema.index(
              { genfeedContentId: 1, isDeleted: 1, organization: 1 },
              {
                name: 'content_org_lookup',
                partialFilterExpression: { isDeleted: false },
              },
            );

            schema.index(
              { adAccountId: 1, isDeleted: 1, organization: 1 },
              {
                name: 'account_org_lookup',
                partialFilterExpression: { isDeleted: false },
              },
            );

            schema.index(
              { externalAdId: 1, isDeleted: 1, organization: 1 },
              {
                name: 'external_ad_lookup',
                partialFilterExpression: { isDeleted: false },
              },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [AdCreativeMappingsService],
})
export class AdCreativeMappingsModule {}
