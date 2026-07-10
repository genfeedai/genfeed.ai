import { SocialSourcesController } from '@api/collections/social-sources/controllers/social-sources.controller';
import { SocialSourcesService } from '@api/collections/social-sources/services/social-sources.service';
import { SourcePostsModule } from '@api/collections/source-posts/source-posts.module';
import { ReplyBotModule } from '@api/services/reply-bot/reply-bot.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [SocialSourcesController],
  exports: [SocialSourcesService],
  imports: [
    forwardRef(() => ReplyBotModule),
    forwardRef(() => SourcePostsModule),
  ],
  providers: [SocialSourcesService],
})
export class SocialSourcesModule {}
