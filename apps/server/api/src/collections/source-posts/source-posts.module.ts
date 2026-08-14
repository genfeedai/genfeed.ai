import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { SourcePostsController } from '@api/collections/source-posts/controllers/source-posts.controller';
import { SourcePostsService } from '@api/collections/source-posts/services/source-posts.service';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [SourcePostsController],
  exports: [SourcePostsService],
  imports: [forwardRef(() => CredentialsCoreModule)],
  providers: [SourcePostsService],
})
export class SourcePostsModule {}
