import { ArticlesModule } from '@api/collections/articles/articles.module';
import { BrandsModule } from '@api/collections/brands/brands.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { MediumController } from '@api/services/integrations/medium/controllers/medium.controller';
import { MediumService } from '@api/services/integrations/medium/services/medium.service';
import { ConfigModule } from '@libs/config/config.module';
import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [MediumController],
  exports: [MediumService],
  imports: [
    forwardRef(() => ConfigModule),
    forwardRef(() => HttpModule),

    forwardRef(() => ArticlesModule),
    forwardRef(() => BrandsModule),
    forwardRef(() => CredentialsCoreModule),
  ],
  providers: [MediumService],
})
export class MediumModule {}
