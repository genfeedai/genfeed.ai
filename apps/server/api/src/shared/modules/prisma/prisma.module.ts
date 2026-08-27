import { PrismaService as LibsPrismaService } from '@libs/prisma/prisma.service';
import { Global, Module } from '@nestjs/common';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';

@Global()
@Module({
  exports: [LibsPrismaService, PrismaService],
  providers: [
    PrismaService,
    { provide: LibsPrismaService, useExisting: PrismaService },
  ],
})
export class PrismaModule {}
