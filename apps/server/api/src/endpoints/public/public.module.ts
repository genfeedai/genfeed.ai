import { ArticlesModule } from '@api/collections/articles/articles.module';
import { BrandsModule } from '@api/collections/brands/brands.module';
import { ImagesModule } from '@api/collections/images/images.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { LinksModule } from '@api/collections/links/links.module';
import { MusicsModule } from '@api/collections/musics/musics.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { VideosModule } from '@api/collections/videos/videos.module';
import { PublicArticlesController } from '@api/endpoints/public/controllers/articles/public.articles.controller';
import { PublicBrandsController } from '@api/endpoints/public/controllers/brands/public.brands.controller';
import { PublicImagesController } from '@api/endpoints/public/controllers/images/public.images.controller';
import { PublicMusicsController } from '@api/endpoints/public/controllers/musics/public.musics.controller';
import { PublicPostsController } from '@api/endpoints/public/controllers/posts/public.posts.controller';
import { PublicRSSController } from '@api/endpoints/public/controllers/rss/rss.controller';
import { PublicVideosController } from '@api/endpoints/public/controllers/videos/public.videos.controller';
import { RssService } from '@api/endpoints/public/services/rss.service';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [
    PublicArticlesController,
    PublicBrandsController,
    PublicImagesController,
    PublicMusicsController,
    PublicPostsController,
    PublicRSSController,
    PublicVideosController,
  ],
  exports: [],
  imports: [
    forwardRef(() => ArticlesModule),
    forwardRef(() => BrandsModule),
    forwardRef(() => FilesClientModule),
    forwardRef(() => ImagesModule),
    forwardRef(() => IngredientsModule),
    forwardRef(() => LinksModule),
    forwardRef(() => MusicsModule),
    forwardRef(() => PostsModule),
    forwardRef(() => VideosModule),
  ],
  providers: [RssService],
})
export class PublicModule {}
