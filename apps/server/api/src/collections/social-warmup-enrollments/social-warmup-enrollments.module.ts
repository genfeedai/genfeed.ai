import { SocialWarmupEnrollmentsController } from '@api/collections/social-warmup-enrollments/controllers/social-warmup-enrollments.controller';
import { SocialWarmupEnrollmentsService } from '@api/collections/social-warmup-enrollments/services/social-warmup-enrollments.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [SocialWarmupEnrollmentsController],
  exports: [SocialWarmupEnrollmentsService],
  providers: [SocialWarmupEnrollmentsService],
})
export class SocialWarmupEnrollmentsModule {}
