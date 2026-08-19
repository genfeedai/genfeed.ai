import { PostingSetsController } from '@api/collections/posting-sets/controllers/posting-sets.controller';
import { PostingSignaturesController } from '@api/collections/posting-sets/controllers/posting-signatures.controller';
import { PostingSetsService } from '@api/collections/posting-sets/services/posting-sets.service';
import { PostingSignaturesService } from '@api/collections/posting-sets/services/posting-signatures.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [PostingSetsController, PostingSignaturesController],
  exports: [PostingSetsService, PostingSignaturesService],
  providers: [PostingSetsService, PostingSignaturesService],
})
export class PostingSetsModule {}
