import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { BreakoutRemixOfferModule } from '@api/collections/outliers/breakout-remix-offer.module';
import { OutliersCoreModule } from '@api/collections/outliers/outliers-core.module';
import { SourcePostsController } from '@api/collections/source-posts/controllers/source-posts.controller';
import { SourcePostsService } from '@api/collections/source-posts/services/source-posts.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [SourcePostsController],
  exports: [SourcePostsService],
  imports: [
    OutliersCoreModule,
    CredentialsCoreModule,
    BreakoutRemixOfferModule,
  ],
  providers: [SourcePostsService],
})
export class SourcePostsModule {}
