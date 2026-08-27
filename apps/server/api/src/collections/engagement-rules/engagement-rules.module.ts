import { EngagementRulesController } from '@api/collections/engagement-rules/controllers/engagement-rules.controller';
import { EngagementRulesService } from '@api/collections/engagement-rules/services/engagement-rules.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [EngagementRulesController],
  exports: [EngagementRulesService],
  providers: [EngagementRulesService],
})
export class EngagementRulesModule {}
