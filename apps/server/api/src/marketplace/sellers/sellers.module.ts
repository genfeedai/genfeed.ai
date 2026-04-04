import { DB_CONNECTIONS } from '@api/constants/database.constants';
import {
  AdminSellersController,
  SellersController,
} from '@api/marketplace/sellers/controllers/sellers.controller';
import {
  Seller,
  SellerSchema,
} from '@api/marketplace/sellers/schemas/seller.schema';
import { SellersService } from '@api/marketplace/sellers/services/sellers.service';
import { StripeConnectService } from '@api/marketplace/sellers/services/stripe-connect.service';
import { StripeModule } from '@api/services/integrations/stripe/stripe.module';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [SellersController, AdminSellersController],
  exports: [SellersService, StripeConnectService],
  imports: [
    StripeModule,
    MongooseModule.forFeatureAsync(
      [
        {
          name: Seller.name,
          useFactory: () => {
            const schema = SellerSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            // Note: user and slug unique indexes are defined in schema via @Prop({ unique: true })

            // Organization queries with soft delete
            schema.index(
              { isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Status and badge filtering
            schema.index({ badgeTier: 1, status: 1 });

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.MARKETPLACE,
    ),
  ],
  providers: [SellersService, StripeConnectService],
})
export class SellersModule {}
