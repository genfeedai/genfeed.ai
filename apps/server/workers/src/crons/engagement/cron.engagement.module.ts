import { PostGroupsModule } from '@api/collections/post-groups/post-groups.module';
import { PublishersModule } from '@api/services/integrations/publishers/publishers.module';
import { PrismaModule } from '@libs/prisma/prisma.module';
import { Module } from '@nestjs/common';
import { CronEngagementTriggersService } from '@workers/crons/engagement/cron.engagement-triggers.service';

@Module({
  exports: [CronEngagementTriggersService],
  imports: [PostGroupsModule, PrismaModule, PublishersModule],
  providers: [CronEngagementTriggersService],
})
export class CronEngagementModule {}
