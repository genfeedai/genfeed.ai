import { ArticlesModule } from '@api/collections/articles/articles.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { PostGroupsModule } from '@api/collections/post-groups/post-groups.module';
import { PostingCadencesController } from '@api/collections/posting-cadences/controllers/posting-cadences.controller';
import { PostingCadenceCopyService } from '@api/collections/posting-cadences/services/posting-cadence-copy.service';
import { PostingCadenceValidationService } from '@api/collections/posting-cadences/services/posting-cadence-validation.service';
import { PostingCadencesService } from '@api/collections/posting-cadences/services/posting-cadences.service';
import { LlmDispatcherModule } from '@api/services/integrations/llm/llm-dispatcher.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [PostingCadencesController],
  exports: [PostingCadencesService],
  imports: [
    ArticlesModule,
    CreditsModule,
    LlmDispatcherModule,
    ModelsModule,
    PostGroupsModule,
  ],
  providers: [
    PostingCadenceCopyService,
    PostingCadencesService,
    PostingCadenceValidationService,
  ],
})
export class PostingCadencesModule {}
