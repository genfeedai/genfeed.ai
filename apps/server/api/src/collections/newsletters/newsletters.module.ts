import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { NewslettersController } from '@api/collections/newsletters/controllers/newsletters.controller';
import { NewslettersService } from '@api/collections/newsletters/services/newsletters.service';
import { AgentArtifactReferenceService, SERVER_TOKENS } from '@api/index';
import { OpenRouterModule } from '@api/services/integrations/openrouter/openrouter.module';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { LoggerService } from '@libs/logger/logger.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [NewslettersController],
  exports: [NewslettersService],
  imports: [BrandsCoreModule, LoggerModule, OpenRouterModule],
  providers: [
    AgentArtifactReferenceService,
    NewslettersService,
    { provide: SERVER_TOKENS.logger, useExisting: LoggerService },
    { provide: SERVER_TOKENS.prisma, useExisting: PrismaService },
  ],
})
export class NewslettersModule {}
