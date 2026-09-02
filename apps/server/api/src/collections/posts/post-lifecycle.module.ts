import { PostLifecycleService, SERVER_TOKENS } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [PostLifecycleService],
  providers: [
    PostLifecycleService,
    { provide: SERVER_TOKENS.logger, useExisting: LoggerService },
    { provide: SERVER_TOKENS.prisma, useExisting: PrismaService },
  ],
})
export class PostLifecycleModule {}
