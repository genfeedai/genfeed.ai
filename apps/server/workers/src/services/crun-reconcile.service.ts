import { CrunContractImportService } from '@api/services/integrations/crun/contracts/crun-contract-import.service';
import { CrunTaskService } from '@api/services/integrations/crun/crun-task.service';
import { CrunTaskFinalizationService } from '@api/services/integrations/crun/crun-task-finalization.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class CrunReconcileService {
  constructor(
    private readonly tasks: CrunTaskService,
    private readonly finalizer: CrunTaskFinalizationService,
    private readonly importer: CrunContractImportService,
    private readonly logger: LoggerService,
  ) {}

  async reconcile(): Promise<void> {
    // Reconciliation remains mounted even when new admissions are disabled.
    const rows = await this.tasks.claimDue();
    for (let offset = 0; offset < rows.length; offset += 4) {
      await Promise.all(
        rows.slice(offset, offset + 4).map(async (task) => {
          try {
            if (task.state === 'provider-failed' && !task.providerTaskId) {
              await this.finalizer.finalize(task.organizationId, task.id);
              return;
            }
            const receipt = await this.tasks.poll(task);
            if (receipt)
              await this.finalizer.finalize(
                task.organizationId,
                task.id,
                receipt,
              );
          } catch {
            // Durable state owns retries. Never log upstream response/key/prompt.
            this.logger.warn('Crun reconciliation phase deferred', {
              taskId: task.id,
              organizationId: task.organizationId,
            });
          }
        }),
      );
    }
  }

  async synchronizeContracts(): Promise<void> {
    await this.importer.synchronize();
  }
}
