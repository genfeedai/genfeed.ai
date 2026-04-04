import { PromptsModule } from '@api/collections/prompts/prompts.module';
import { SkillsModule } from '@api/collections/skills/skills.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { ListingsModule } from '@api/marketplace/listings/listings.module';
import {
  AdminMarketplaceController,
  AdminMarketplacePurchasesController,
  PurchasesController,
} from '@api/marketplace/purchases/controllers/purchases.controller';
import {
  Purchase,
  PurchaseSchema,
} from '@api/marketplace/purchases/schemas/purchase.schema';
import { CheckoutService } from '@api/marketplace/purchases/services/checkout.service';
import { InstallService } from '@api/marketplace/purchases/services/install.service';
import { PurchasesService } from '@api/marketplace/purchases/services/purchases.service';
import { SellersModule } from '@api/marketplace/sellers/sellers.module';
import { StripeModule } from '@api/services/integrations/stripe/stripe.module';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [
    PurchasesController,
    AdminMarketplacePurchasesController,
    AdminMarketplaceController,
  ],
  exports: [PurchasesService, CheckoutService, InstallService],
  imports: [
    forwardRef(() => ListingsModule),
    forwardRef(() => PromptsModule),
    SellersModule,
    SkillsModule,
    StripeModule,
    forwardRef(() => WorkflowsModule),
    MongooseModule.forFeatureAsync(
      [
        {
          name: Purchase.name,
          useFactory: () => {
            const schema = PurchaseSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            // Unique constraint: buyer can only purchase a listing once
            schema.index(
              { buyer: 1, listing: 1 },
              {
                partialFilterExpression: {
                  isDeleted: false,
                  status: 'completed',
                },
                unique: true,
              },
            );

            // Buyer's purchases with organization
            schema.index(
              { buyer: 1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Seller's sales with status
            schema.index({ seller: 1, status: 1 });

            // Listing purchases with status
            schema.index({ listing: 1, status: 1 });

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.MARKETPLACE,
    ),
  ],
  providers: [PurchasesService, CheckoutService, InstallService],
})
export class PurchasesModule {}
