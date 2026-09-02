import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { PrismaService as LibsPrismaService } from '@libs/prisma/prisma.service';
import { Global, Module } from '@nestjs/common';

@Global()
@Module({
  exports: [LibsPrismaService, PrismaService],
  providers: [
    PrismaService,
    { provide: LibsPrismaService, useExisting: PrismaService },
  ],
})
export class PrismaModule {}
