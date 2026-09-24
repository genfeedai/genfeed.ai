import { ResearchAccessService } from '@api/services/research-access/research-access.service';
import { ResearchCollectionJobService } from '@api/services/research-access/research-collection-job.service';
import { createServiceModule } from '@api/shared/service-module.factory';

export const ResearchAccessModule = createServiceModule(ResearchAccessService, {
  additionalExports: [ResearchCollectionJobService],
  additionalProviders: [ResearchCollectionJobService],
});
