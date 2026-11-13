import { CreditsModule } from '@api/collections/credits/credits.module';
import { LifetimeDealService } from '@api/services/lifetime-deal/lifetime-deal.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  exports: [LifetimeDealService],
  imports: [CreditsModule, LoggerModule, PrismaModule],
  providers: [LifetimeDealService],
})
export class LifetimeDealModule {}
