import { ResearchAccessService } from '@api/services/research-access/research-access.service';
import { ResearchCollectionJobService } from '@api/services/research-access/research-collection-job.service';
import { ResearchScanService } from '@api/services/research-access/research-scan.service';
import { createServiceModule } from '@api/shared/service-module.factory';

export const ResearchAccessModule = createServiceModule(ResearchAccessService, {
  additionalExports: [ResearchCollectionJobService, ResearchScanService],
  additionalProviders: [ResearchCollectionJobService, ResearchScanService],
});
