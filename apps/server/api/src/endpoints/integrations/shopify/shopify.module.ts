import { ApiKeysModule } from '@api/collections/api-keys/api-keys.module';
import { BrandsModule } from '@api/collections/brands/brands.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { UsersModule } from '@api/collections/users/users.module';
import { ConfigModule } from '@api/config/config.module';
import {
  CreditProvisionController,
  ShopifyController,
} from '@api/endpoints/integrations/shopify/shopify.controller';
import { AdminApiKeyGuard } from '@api/helpers/guards/admin-api-key/admin-api-key.guard';
import { ApiKeyAuthGuard } from '@api/helpers/guards/api-key/api-key.guard';
import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import { CombinedAuthGuard } from '@api/helpers/guards/combined-auth/combined-auth.guard';
import { Module } from '@nestjs/common';

@Module({
  controllers: [ShopifyController, CreditProvisionController],
  imports: [
    ApiKeysModule,
    BrandsModule,
    ConfigModule,
    CreditsModule,
    OrganizationsModule,
    UsersModule,
  ],
  providers: [AdminApiKeyGuard, ApiKeyAuthGuard, ClerkGuard, CombinedAuthGuard],
})
export class ShopifyModule {}
