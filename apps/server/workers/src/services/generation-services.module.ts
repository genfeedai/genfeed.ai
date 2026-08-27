import { Module } from '@nestjs/common';
import { CustomerInstanceResolverService } from '@server/collections/customer-instances/customer-instance-resolver.service';
import { SERVER_TOKENS } from '@server/server.dependencies';
import { ElevenLabsService } from '@server/services/integrations/elevenlabs/services/elevenlabs.service';
import { FalService } from '@server/services/integrations/fal/services/fal.service';
import { FleetService } from '@server/services/integrations/fleet/fleet.service';
import { HiggsFieldService } from '@server/services/integrations/higgsfield/higgsfield.service';
import { KlingAIService } from '@server/services/integrations/klingai/services/klingai.service';
import { LeonardoAIService } from '@server/services/integrations/leonardoai/services/leonardoai.service';
import { ReplicateService } from '@server/services/integrations/replicate/services/replicate.service';
import { WorkersDomainModule } from '@server/workers-domain.module';
import { FileServicesModule } from '@workers/services/file-services.module';

const GENERATION_SERVICES = [
  ElevenLabsService,
  FalService,
  FleetService,
  HiggsFieldService,
  KlingAIService,
  LeonardoAIService,
  ReplicateService,
] as const;

@Module({
  exports: [...GENERATION_SERVICES],
  imports: [WorkersDomainModule, FileServicesModule],
  providers: [
    {
      provide: SERVER_TOKENS.customerInstances,
      useExisting: CustomerInstanceResolverService,
    },
  ],
})
export class GenerationServicesModule {}
