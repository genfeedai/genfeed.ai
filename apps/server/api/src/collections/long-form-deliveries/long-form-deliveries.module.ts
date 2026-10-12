import { ArticlesModule } from '@api/collections/articles/articles.module';
import { ArticleDeliveriesController } from '@api/collections/long-form-deliveries/controllers/article-deliveries.controller';
import { NewsletterDeliveriesController } from '@api/collections/long-form-deliveries/controllers/newsletter-deliveries.controller';
import { LongFormDeliveriesService } from '@api/collections/long-form-deliveries/services/long-form-deliveries.service';
import { NewslettersModule } from '@api/collections/newsletters/newsletters.module';
import { PostGroupsModule } from '@api/collections/post-groups/post-groups.module';
import { Module } from '@nestjs/common';

/**
 * Leaf module: delivers Articles and Newsletters through the scheduler
 * (#6753). Nothing imports it, so composing the article, newsletter and
 * scheduler modules here adds no cycle between them.
 */
@Module({
  controllers: [ArticleDeliveriesController, NewsletterDeliveriesController],
  imports: [ArticlesModule, NewslettersModule, PostGroupsModule],
  providers: [LongFormDeliveriesService],
})
export class LongFormDeliveriesModule {}
