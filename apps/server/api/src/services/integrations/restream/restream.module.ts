import { BrandsModule } from '@api/collections/brands/brands.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { RestreamController } from '@api/services/integrations/restream/controllers/restream.controller';
import { RestreamService } from '@api/services/integrations/restream/services/restream.service';
import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [RestreamController],
  exports: [RestreamService],
  imports: [
    HttpModule,
    forwardRef(() => BrandsModule),
    forwardRef(() => CredentialsCoreModule),
  ],
  providers: [RestreamService],
})
export class RestreamModule {}
