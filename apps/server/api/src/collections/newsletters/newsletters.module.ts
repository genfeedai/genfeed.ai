import { BrandsModule } from '@api/collections/brands/brands.module';
import { NewslettersController } from '@api/collections/newsletters/controllers/newsletters.controller';
import { NewslettersService } from '@api/collections/newsletters/services/newsletters.service';
import { OpenRouterModule } from '@api/services/integrations/openrouter/openrouter.module';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  AgentArtifactReferenceService,
  SERVER_TOKENS,
} from '@genfeedai/server';
import { LoggerModule } from '@libs/logger/logger.module';
import { LoggerService } from '@libs/logger/logger.service';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [NewslettersController],
  exports: [NewslettersService],
  imports: [
    forwardRef(() => BrandsModule),
    LoggerModule,
    forwardRef(() => OpenRouterModule),
  ],
  providers: [
    AgentArtifactReferenceService,
    NewslettersService,
    { provide: SERVER_TOKENS.logger, useExisting: LoggerService },
    { provide: SERVER_TOKENS.prisma, useExisting: PrismaService },
  ],
})
export class NewslettersModule {}
