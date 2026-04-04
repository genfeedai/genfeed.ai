import { ListingsModule } from '@api/marketplace/listings/listings.module';
import { PurchasesModule } from '@api/marketplace/purchases/purchases.module';
import { SellersModule } from '@api/marketplace/sellers/sellers.module';
import { Module } from '@nestjs/common';

@Module({
  exports: [SellersModule, ListingsModule, PurchasesModule],
  imports: [SellersModule, ListingsModule, PurchasesModule],
})
export class MarketplaceModule {}
