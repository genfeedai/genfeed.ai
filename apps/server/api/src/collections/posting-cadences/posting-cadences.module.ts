import { PostGroupsModule } from '@api/collections/post-groups/post-groups.module';
import { PostingCadencesController } from '@api/collections/posting-cadences/controllers/posting-cadences.controller';
import { PostingCadencesService } from '@api/collections/posting-cadences/services/posting-cadences.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [PostingCadencesController],
  exports: [PostingCadencesService],
  imports: [PostGroupsModule],
  providers: [PostingCadencesService],
})
export class PostingCadencesModule {}
