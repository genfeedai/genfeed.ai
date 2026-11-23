import { BrandsModule } from '@api/collections/brands/brands.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { DEFAULT_HTTP_TIMEOUT_MS } from '@api/constants/http-timeout.constant';
import { MediumController } from '@api/services/integrations/medium/controllers/medium.controller';
import { MediumService } from '@api/services/integrations/medium/services/medium.service';
import { ConfigModule } from '@libs/config/config.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

@Module({
  controllers: [MediumController],
  exports: [MediumService],
  imports: [
    ConfigModule,
    HttpModule.register({ timeout: DEFAULT_HTTP_TIMEOUT_MS }),

    BrandsModule,
    CredentialsCoreModule,
  ],
  providers: [MediumService],
})
export class MediumModule {}
