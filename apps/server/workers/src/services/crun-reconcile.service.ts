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
    // Safety net for dispatches that died before compensating; the failed rows
    // are claimed and finalized by the same pass.
    await this.tasks.failStalePrepared().catch(() => {
      this.logger.warn('Crun stale prepared sweep deferred');
    });
    const rows = await this.tasks.claimDue();
    await Promise.all(
      rows.map(async (claimed) => {
        const controller = new AbortController();
        let renewing = false;
        const timer = setInterval(() => {
          if (renewing || controller.signal.aborted) return;
          renewing = true;
          this.tasks
            .renewLease(claimed)
            .then((owned) => {
              if (!owned) controller.abort();
            })
            .catch(() => {
              controller.abort();
            })
            .finally(() => {
              renewing = false;
            });
        }, 20000);
        try {
          const terminal =
            claimed.state === 'provider-failed' ||
            (claimed.state === 'provider-success' &&
              (claimed.mediaPersistedAt !== null ||
                claimed.nextMediaAttemptAt === null ||
                claimed.nextMediaAttemptAt > new Date()));
          if (terminal) {
            if (
              !controller.signal.aborted &&
              (await this.tasks.ownsLease(claimed))
            )
              await this.finalizer.finalize(
                claimed,
                undefined,
                controller.signal,
              );
            return;
          }
          const result = await this.tasks.poll(
            claimed,
            new Date(),
            controller.signal,
          );
          if (
            result &&
            !controller.signal.aborted &&
            (await this.tasks.ownsLease(result.task))
          )
            await this.finalizer.finalize(
              result.task,
              result.info,
              controller.signal,
            );
        } catch {
          this.logger.warn('Crun reconciliation phase deferred', {
            taskId: claimed.id,
            organizationId: claimed.organizationId,
          });
        } finally {
          clearInterval(timer);
        }
      }),
    );
  }

  async synchronizeContracts(): Promise<void> {
    await this.importer.synchronize();
  }
}
