import { ArticlesModule } from '@api/collections/articles/articles.module';
import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { ImagesModule } from '@api/collections/images/images.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { LinksModule } from '@api/collections/links/links.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { MusicsModule } from '@api/collections/musics/musics.module';
import { NewslettersModule } from '@api/collections/newsletters/newsletters.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { VideosModule } from '@api/collections/videos/videos.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { PublicArticlesController } from '@api/endpoints/public/controllers/articles/public.articles.controller';
import { PublicBrandOsController } from '@api/endpoints/public/controllers/brand-os/public.brand-os.controller';
import { PublicBrandsController } from '@api/endpoints/public/controllers/brands/public.brands.controller';
import { PublicImagesController } from '@api/endpoints/public/controllers/images/public.images.controller';
import { PublicMediaController } from '@api/endpoints/public/controllers/media/public-media.controller';
import { PublicModelsController } from '@api/endpoints/public/controllers/models/public.models.controller';
import { PublicMusicsController } from '@api/endpoints/public/controllers/musics/public.musics.controller';
import { PublicNewslettersController } from '@api/endpoints/public/controllers/newsletters/public.newsletters.controller';
import { PublicPostsController } from '@api/endpoints/public/controllers/posts/public.posts.controller';
import { PublicRSSController } from '@api/endpoints/public/controllers/rss/rss.controller';
import { PublicVideosController } from '@api/endpoints/public/controllers/videos/public.videos.controller';
import { PublicYoutubeClipsController } from '@api/endpoints/public/controllers/youtube-clips/public-youtube-clips.controller';
import { PublicYoutubeLongFormController } from '@api/endpoints/public/controllers/youtube-long-form/public-youtube-long-form.controller';
import { NewsletterImportFeedService } from '@api/endpoints/public/services/newsletter-import-feed.service';
import { PublicMediaService } from '@api/endpoints/public/services/public-media.service';
import { PublicYoutubeClipsService } from '@api/endpoints/public/services/public-youtube-clips.service';
import { RssService } from '@api/endpoints/public/services/rss.service';
import { ClipAnalyzeModule } from '@api/queues/clip-analyze/clip-analyze.module';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { FileQueueModule } from '@api/services/files-microservice/queue/file-queue.module';
import { PublicClipToolStoreModule } from '@api/services/public-clip-tool/public-clip-tool-store.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

@Module({
  controllers: [
    PublicArticlesController,
    PublicBrandsController,
    PublicBrandOsController,
    PublicImagesController,
    PublicMediaController,
    PublicModelsController,
    PublicMusicsController,
    PublicNewslettersController,
    PublicPostsController,
    PublicRSSController,
    PublicVideosController,
    PublicYoutubeClipsController,
    PublicYoutubeLongFormController,
  ],
  exports: [],
  imports: [
    ArticlesModule,
    BrandsCoreModule,
    ClipAnalyzeModule,
    FilesClientModule,
    FileQueueModule,
    HttpModule,
    ImagesModule,
    IngredientsModule,
    LinksModule,
    ModelsModule,
    MusicsModule,
    NewslettersModule,
    PostsModule,
    PublicClipToolStoreModule,
    VideosModule,
    WorkflowsModule,
  ],
  providers: [
    NewsletterImportFeedService,
    PublicMediaService,
    PublicYoutubeClipsService,
    RssService,
  ],
})
export class PublicModule {}
