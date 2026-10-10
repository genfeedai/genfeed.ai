import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [PrismaModule],
  providers: [BrandAccessService],
  exports: [BrandAccessService],
})
export class BrandAccessModule {}
