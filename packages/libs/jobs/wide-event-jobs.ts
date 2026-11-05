import type { WideEventServiceIdentity } from '@libs/logger/wide-event/wide-event.interface';
import {
  runJobWithWideEvent,
  type WideEventJobLike,
} from '@libs/logger/wide-event/wide-event.job';
import type { WideEventSink } from '@libs/logger/wide-event/wide-event.lifecycle';
import { ProcessorDecoratorService } from '@nestjs/bullmq';

interface WideEventJobInstrumentation {
  identity: WideEventServiceIdentity;
  sink: WideEventSink;
}

let installed: WideEventJobInstrumentation | undefined;

/**
 * Makes every `@Processor` job in this process emit one wide event.
 *
 * `@nestjs/bullmq` routes each processor through
 * `ProcessorDecoratorService.decorate`, its documented override point. Call
 * this once per process, after the logger exists and before the app registers
 * its workers (`app.listen()` in the HTTP services, `BullRegistrar.register()`
 * in workers), so no processor needs to know about logging.
 */
export function installWideEventJobInstrumentation(
  instrumentation: WideEventJobInstrumentation,
): void {
  const isAlreadyInstalled = installed !== undefined;
  installed = instrumentation;
  if (isAlreadyInstalled) return;

  ProcessorDecoratorService.prototype.decorate = function decorate(processor) {
    return (job, token) => {
      const current = installed;
      return current
        ? runJobWithWideEvent(job as WideEventJobLike, current, () =>
            processor(job, token),
          )
        : processor(job, token);
    };
  };
}
