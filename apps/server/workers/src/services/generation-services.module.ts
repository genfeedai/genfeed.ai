import { CustomerInstanceResolverService } from '@api/collections/customer-instances/customer-instance-resolver.service';
import { SERVER_TOKENS } from '@api/server.dependencies';
import { ByokModule } from '@api/services/byok/byok.module';
import { ElevenLabsService } from '@api/services/integrations/elevenlabs/services/elevenlabs.service';
import { FalService } from '@api/services/integrations/fal/services/fal.service';
import { HiggsFieldService } from '@api/services/integrations/higgsfield/higgsfield.service';
import { KlingAIService } from '@api/services/integrations/klingai/services/klingai.service';
import { LeonardoAIService } from '@api/services/integrations/leonardoai/services/leonardoai.service';
import { ManagedInferenceRuntimeService } from '@api/services/integrations/managed-inference-runtime/managed-inference-runtime.service';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { PollUntilService } from '@api/shared/services/poll-until/poll-until.service';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaModule } from '@libs/prisma/prisma.module';
import { PrismaService } from '@libs/prisma/prisma.service';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { FileServicesModule } from '@workers/services/file-services.module';

const GENERATION_SERVICES = [
  ElevenLabsService,
  FalService,
  ManagedInferenceRuntimeService,
  HiggsFieldService,
  KlingAIService,
  LeonardoAIService,
  ReplicateService,
] as const;

@Module({
  exports: [...GENERATION_SERVICES],
  imports: [
    ByokModule,
    ConfigModule,
    FileServicesModule,
    HttpModule,
    LoggerModule,
    PrismaModule,
  ],
  providers: [
    ...GENERATION_SERVICES,
    CustomerInstanceResolverService,
    PollUntilService,
    { provide: SERVER_TOKENS.logger, useExisting: LoggerService },
    { provide: SERVER_TOKENS.prisma, useExisting: PrismaService },
    {
      provide: SERVER_TOKENS.customerInstances,
      useExisting: CustomerInstanceResolverService,
    },
  ],
})
export class GenerationServicesModule {}
