import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Module } from '@nestjs/common';
import { AdOptimizationConfigsService } from '@server/collections/ad-optimization-configs/services/ad-optimization-configs.service';
import { SERVER_TOKENS } from '@server/server.dependencies';

@Module({
  exports: [AdOptimizationConfigsService],
  imports: [],
  providers: [
    AdOptimizationConfigsService,
    { provide: SERVER_TOKENS.logger, useExisting: LoggerService },
    { provide: SERVER_TOKENS.prisma, useExisting: PrismaService },
  ],
})
export class AdOptimizationConfigsModule {}
