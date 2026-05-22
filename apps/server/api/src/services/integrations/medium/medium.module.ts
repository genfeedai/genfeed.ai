import { ArticlesModule } from '@api/collections/articles/articles.module';
import { BrandsModule } from '@api/collections/brands/brands.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { ConfigModule } from '@api/config/config.module';
import { MediumController } from '@api/services/integrations/medium/controllers/medium.controller';
import { MediumService } from '@api/services/integrations/medium/services/medium.service';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

@Module({
  controllers: [MediumController],
  exports: [MediumService],
  imports: [
    ConfigModule,
    HttpModule,

    ArticlesModule,
    BrandsModule,
    CredentialsCoreModule,
  ],
  providers: [MediumService],
})
export class MediumModule {}
