import { BrandAccessModule } from '@api/authorization/brand-access/brand-access.module';
import { TeammateMentionsService } from '@api/collections/mentions/services/teammate-mentions.service';
import { Module } from '@nestjs/common';

/**
 * Validates and announces @-mentions of teammates (#9946). A leaf module: it
 * depends on brand access only, so threads and task comments can both use it
 * without a cycle.
 */
@Module({
  exports: [TeammateMentionsService],
  imports: [BrandAccessModule],
  providers: [TeammateMentionsService],
})
export class MentionsModule {}
