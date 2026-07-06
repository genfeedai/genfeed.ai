/**
 * GIFs Module
 * Manages GIF ingredients generated from videos: listing, metadata management,
 * and GIF-specific workflows.
 */
import { BrandsModule } from '@api/collections/brands/brands.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { GifsController } from '@api/collections/gifs/controllers/gifs.controller';
import { GifsService } from '@api/collections/gifs/services/gifs.service';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { MetadataModule } from '@api/collections/metadata/metadata.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { VotesModule } from '@api/collections/votes/votes.module';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ByokModule } from '@api/services/byok/byok.module';
import { ConfigModule } from '@libs/config/config.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [GifsController],
  exports: [GifsService],
  imports: [
    forwardRef(() => BrandsModule),
    forwardRef(() => ByokModule),
    forwardRef(() => ConfigModule),
    forwardRef(() => CreditsModule),
    forwardRef(() => IngredientsModule),
    forwardRef(() => MetadataModule),
    forwardRef(() => ModelsModule),
    forwardRef(() => VotesModule),
  ],
  providers: [GifsService, CreditsGuard, CreditsInterceptor],
})
export class GifsModule {}
