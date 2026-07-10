import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Module } from '@nestjs/common';
import { AdOptimizationRecommendationsService } from '@server/collections/ad-optimization-recommendations/services/ad-optimization-recommendations.service';
import { SERVER_TOKENS } from '@server/server.dependencies';

@Module({
  exports: [AdOptimizationRecommendationsService],
  imports: [],
  providers: [
    AdOptimizationRecommendationsService,
    { provide: SERVER_TOKENS.logger, useExisting: LoggerService },
    { provide: SERVER_TOKENS.prisma, useExisting: PrismaService },
  ],
})
export class AdOptimizationRecommendationsModule {}
