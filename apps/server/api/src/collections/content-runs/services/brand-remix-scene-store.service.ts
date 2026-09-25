import { BrandRemixRunPersistenceService } from '@api/collections/content-runs/services/brand-remix-run-persistence.service';
import { BrandRemixRunPlanningService } from '@api/collections/content-runs/services/brand-remix-run-planning.service';
import { projectBrandRemixRun } from '@api/collections/content-runs/services/brand-remix-run-projection';
import type { BrandRemixRunConfig } from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import { brandRemixRunConfigSchema } from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import { ContentRunStatus } from '@genfeedai/contracts';
import { ConflictException, Injectable } from '@nestjs/common';

@Injectable()
export class BrandRemixSceneStoreService {
  constructor(
    private readonly persistence: BrandRemixRunPersistenceService,
    private readonly planning: BrandRemixRunPlanningService,
  ) {}
  async read(organizationId: string, runId: string, expectedRevision?: number) {
    const run = await this.persistence.requireRun(organizationId, runId);
    const config = this.persistence.parseConfig(run.config, runId);
    if (expectedRevision !== undefined && expectedRevision !== config.revision)
      throw new ConflictException('The remix changed. Reload and retry.');
    return { run, config, brandId: this.persistence.requireBrandId(run) };
  }
  async save(
    organizationId: string,
    runId: string,
    previous: BrandRemixRunConfig,
    next: BrandRemixRunConfig,
  ) {
    const nextConfig = brandRemixRunConfigSchema.parse(next);
    const run = await this.persistence.compareAndSwapExactConfig({
      expectedConfig: previous,
      nextConfig,
      organizationId,
      runId,
      status:
        next.phase === 'ready_for_review'
          ? ContentRunStatus.COMPLETED
          : next.scenePipeline &&
              ['analysing', 'generating', 'assembling'].includes(
                next.scenePipeline.state,
              )
            ? ContentRunStatus.RUNNING
            : ContentRunStatus.PENDING,
    });
    if (!run)
      throw new ConflictException(
        'The remix changed during this operation. Reload and retry.',
      );
    return nextConfig;
  }
  async view(organizationId: string, runId: string) {
    const { run, config, brandId } = await this.read(organizationId, runId);
    return projectBrandRemixRun(
      run,
      await this.planning.resolveBrandContext(organizationId, brandId),
      config,
    );
  }
  async fence(organizationId: string, runId: string, operationId: string) {
    const saved = await this.read(organizationId, runId);
    const pipeline = saved.config.scenePipeline;
    if (
      !pipeline?.operation ||
      pipeline.operation.id !== operationId ||
      pipeline.state === 'cancelled' ||
      pipeline.operation.revision !== saved.config.revision ||
      pipeline.operation.cancellationGeneration !==
        pipeline.cancellationGeneration
    )
      throw new ConflictException(
        'Scene operation was cancelled or superseded.',
      );
    return saved;
  }
}
