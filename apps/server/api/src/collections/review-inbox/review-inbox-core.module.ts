import { BrandAccessModule } from '@api/authorization/brand-access/brand-access.module';
import { ReviewInboxService } from '@api/collections/review-inbox/services/review-inbox.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { Module } from '@nestjs/common';

/** Read side of the review inbox; safe to import from agent tooling. */
@Module({
  exports: [ReviewInboxService],
  imports: [BrandAccessModule, PrismaModule],
  providers: [ReviewInboxService, RolesGuard],
})
export class ReviewInboxCoreModule {}
