import { ArticlesModule } from '@api/collections/articles/articles.module';
import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { ClipperProjectsCoreModule } from '@api/collections/clipper-projects/clipper-projects-core.module';
import { ContentPreviewsModule } from '@api/collections/content-previews/content-previews.module';
import { ImagesModule } from '@api/collections/images/images.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { LinksModule } from '@api/collections/links/links.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { MusicsModule } from '@api/collections/musics/musics.module';
import { PlatformSettingsModule } from '@api/collections/platform-settings/platform-settings.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { ReferralsModule } from '@api/collections/referrals/referrals.module';
import { VideosModule } from '@api/collections/videos/videos.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { PublicArticlesController } from '@api/endpoints/public/controllers/articles/public.articles.controller';
import { PublicBrandOsController } from '@api/endpoints/public/controllers/brand-os/public.brand-os.controller';
import { PublicBrandsController } from '@api/endpoints/public/controllers/brands/public.brands.controller';
import { PublicImagesController } from '@api/endpoints/public/controllers/images/public.images.controller';
import { PublicMediaController } from '@api/endpoints/public/controllers/media/public-media.controller';
import { PublicModelsController } from '@api/endpoints/public/controllers/models/public.models.controller';
import { PublicMusicsController } from '@api/endpoints/public/controllers/musics/public.musics.controller';
import { PublicPlatformFlagsController } from '@api/endpoints/public/controllers/platform-flags/public.platform-flags.controller';
import { PublicPostsController } from '@api/endpoints/public/controllers/posts/public.posts.controller';
import { PublicPreviewsController } from '@api/endpoints/public/controllers/previews/public.previews.controller';
import { PublicRSSController } from '@api/endpoints/public/controllers/rss/rss.controller';
import { PublicVideosController } from '@api/endpoints/public/controllers/videos/public.videos.controller';
import { PublicYoutubeClipperController } from '@api/endpoints/public/controllers/youtube-clipper/public-youtube-clipper.controller';
import { PublicYoutubeLongFormController } from '@api/endpoints/public/controllers/youtube-long-form/public-youtube-long-form.controller';
import { PublicArticleGenerationsService } from '@api/endpoints/public/services/public-article-generations.service';
import { PublicBrandSocialsService } from '@api/endpoints/public/services/public-brand-socials.service';
import { PublicMediaService } from '@api/endpoints/public/services/public-media.service';
import { PublicViewsService } from '@api/endpoints/public/services/public-views.service';
import { PublicYoutubeClipperService } from '@api/endpoints/public/services/public-youtube-clipper.service';
import { RssService } from '@api/endpoints/public/services/rss.service';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { FileQueueModule } from '@api/services/files-microservice/queue/file-queue.module';
import { MediaUrlsModule } from '@api/services/media-urls/media-urls.module';
import { PublicClipperToolStoreModule } from '@api/services/public-clipper-tool/public-clipper-tool-store.module';
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
    PublicPlatformFlagsController,
    PublicPostsController,
    PublicPreviewsController,
    PublicRSSController,
    PublicVideosController,
    PublicYoutubeClipperController,
    PublicYoutubeLongFormController,
  ],
  exports: [],
  imports: [
    ArticlesModule,
    BrandsCoreModule,
    ClipperProjectsCoreModule,
    ContentPreviewsModule,
    FilesClientModule,
    MediaUrlsModule,
    FileQueueModule,
    HttpModule,
    ImagesModule,
    IngredientsModule,
    LinksModule,
    ModelsModule,
    MusicsModule,
    PlatformSettingsModule,
    PostsModule,
    ReferralsModule,
    PublicClipperToolStoreModule,
    VideosModule,
    WorkflowsModule,
  ],
  providers: [
    PublicMediaService,
    PublicArticleGenerationsService,
    PublicBrandSocialsService,
    PublicViewsService,
    PublicYoutubeClipperService,
    RssService,
  ],
})
export class PublicModule {}
