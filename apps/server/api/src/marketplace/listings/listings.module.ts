import { DB_CONNECTIONS } from '@api/constants/database.constants';
import {
  AdminListingsController,
  ListingsController,
  SellerListingsController,
} from '@api/marketplace/listings/controllers/listings.controller';
import {
  Listing,
  ListingSchema,
} from '@api/marketplace/listings/schemas/listing.schema';
import { ListingsService } from '@api/marketplace/listings/services/listings.service';
import { PurchasesModule } from '@api/marketplace/purchases/purchases.module';
import { SellersModule } from '@api/marketplace/sellers/sellers.module';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [
    ListingsController,
    SellerListingsController,
    AdminListingsController,
  ],
  exports: [ListingsService],
  imports: [
    forwardRef(() => PurchasesModule),
    SellersModule,
    MongooseModule.forFeatureAsync(
      [
        {
          name: Listing.name,
          useFactory: () => {
            const schema = ListingSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            // Note: slug unique index is defined in schema via @Prop({ unique: true })

            // Seller's listings with soft delete
            schema.index(
              { isDeleted: 1, seller: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Organization queries with status and type
            schema.index({ isDeleted: 1, organization: 1, status: 1, type: 1 });

            // Trending listings (published, sorted by date)
            schema.index({ publishedAt: -1, status: 1 });

            // Tag filtering
            schema.index({ tags: 1 });

            // Package source upsert (for seed idempotency)
            schema.index(
              { packageSlug: 1, packageSource: 1 },
              {
                partialFilterExpression: {
                  packageSlug: { $exists: true },
                  packageSource: { $exists: true },
                },
                sparse: true,
              },
            );

            // Official and pricing tier filtering
            schema.index({ isOfficial: 1, pricingTier: 1, status: 1 });

            // Text search on title and descriptions
            schema.index(
              { description: 'text', shortDescription: 'text', title: 'text' },
              { weights: { description: 1, shortDescription: 5, title: 10 } },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.MARKETPLACE,
    ),
  ],
  providers: [ListingsService],
})
export class ListingsModule {}
