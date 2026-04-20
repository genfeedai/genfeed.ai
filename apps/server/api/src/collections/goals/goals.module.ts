import { GoalsController } from '@api/collections/goals/controllers/goals.controller';
import { GoalsService } from '@api/collections/goals/services/goals.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [GoalsController],
  exports: [GoalsService],
  imports: [LoggerModule],
  providers: [GoalsService],
})
export class GoalsModule {}
