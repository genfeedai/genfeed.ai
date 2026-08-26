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
import { NewsletterImportFeedService } from '@api/endpoints/public/services/newsletter-import-feed.service';
import { PublicMediaService } from '@api/endpoints/public/services/public-media.service';
import { RssService } from '@api/endpoints/public/services/rss.service';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
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
  ],
  exports: [],
  imports: [
    ArticlesModule,
    BrandsCoreModule,
    FilesClientModule,
    ImagesModule,
    IngredientsModule,
    LinksModule,
    ModelsModule,
    MusicsModule,
    NewslettersModule,
    PostsModule,
    VideosModule,
  ],
  providers: [NewsletterImportFeedService, PublicMediaService, RssService],
})
export class PublicModule {}
