import { AdCreativeMappingsService } from '@api/collections/ad-creative-mappings/services/ad-creative-mappings.service';
import { SERVER_TOKENS } from '@api/server.dependencies';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [AdCreativeMappingsService],
  imports: [],
  providers: [
    AdCreativeMappingsService,
    { provide: SERVER_TOKENS.logger, useExisting: LoggerService },
    { provide: SERVER_TOKENS.prisma, useExisting: PrismaService },
  ],
})
export class AdCreativeMappingsModule {}
