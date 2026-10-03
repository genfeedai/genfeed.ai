import { describe, expect, it } from 'vitest';
import { analyzeWorkflowDispatchClassSource } from './check-workflow-dispatch-class';

describe('check-workflow-dispatch-class', () => {
  it.each([
    'WORKFLOW_EXECUTION_QUEUE',
    'WORKFLOW_BACKGROUND_QUEUE',
    'PLATFORM_SYSTEM_WORKFLOW_QUEUE',
  ])('rejects a namespace-qualified %s injection', (token) => {
    expect(
      analyzeWorkflowDispatchClassSource(
        `
        import * as Queues from '@genfeedai/contracts/queue';
        class Rogue { constructor(@InjectQueue(Queues.${token}) queue: Queue) {} }
      `,
        'apps/server/api/src/services/example/example.service.ts',
      ),
    ).toHaveLength(1);
  });

  it.each(['WORKFLOW_BACKGROUND_QUEUE', 'PLATFORM_SYSTEM_WORKFLOW_QUEUE'])(
    'rejects %s in the registry boot-drain exception',
    (token) => {
      expect(
        analyzeWorkflowDispatchClassSource(
          `
        import { ${token} as QueueToken } from '@genfeedai/contracts/queue';
        class Registry { constructor(@InjectQueue(QueueToken) queue: Queue) {} }
      `,
          'apps/server/workers/src/scheduling/platform-schedule-registry.service.ts',
        ),
      ).toHaveLength(1);
    },
  );

  it('accepts a queueSystemWorkflow call that declares dispatchClass', () => {
    const source = `
      class Producer {
        async run() {
          await this.queue.queueSystemWorkflow(input, jobId, {
            dispatchClass: SystemWorkflowDispatchClass.BACKGROUND,
          });
        }
      }
    `;

    expect(
      analyzeWorkflowDispatchClassSource(
        source,
        'apps/server/api/src/services/example/example.service.ts',
      ),
    ).toEqual([]);
  });

  it('rejects a queueSystemWorkflow call with no options argument (red before #5271)', () => {
    const source = `
      class Producer {
        async run() {
          await this.queue.queueSystemWorkflow(input, jobId);
        }
      }
    `;

    const violations = analyzeWorkflowDispatchClassSource(
      source,
      'apps/server/api/src/services/example/example.service.ts',
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain('missing its options argument');
  });

  it('rejects an options object literal that omits dispatchClass', () => {
    const source = `
      class Producer {
        async run() {
          await this.queue.queueSystemWorkflow(input, jobId, {
            attempts: 3,
          });
        }
      }
    `;

    const violations = analyzeWorkflowDispatchClassSource(
      source,
      'apps/server/api/src/services/example/example.service.ts',
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain('without dispatchClass');
  });

  it('does not flag a spread options object — the compiler already checked its type', () => {
    const source = `
      class Producer {
        async run() {
          await this.queue.queueSystemWorkflow(input, jobId, {
            ...queueOptions,
          });
        }
      }
    `;

    expect(
      analyzeWorkflowDispatchClassSource(
        source,
        'apps/server/api/src/services/example/example.service.ts',
      ),
    ).toEqual([]);
  });

  it('rejects a new @InjectQueue(WORKFLOW_BACKGROUND_QUEUE) outside the queue service', () => {
    const source = `
      import { WORKFLOW_BACKGROUND_QUEUE } from '@genfeedai/contracts/queue';
      import { InjectQueue } from '@nestjs/bullmq';

      class RogueProducer {
        constructor(@InjectQueue(WORKFLOW_BACKGROUND_QUEUE) private readonly queue: Queue) {}
      }
    `;

    const violations = analyzeWorkflowDispatchClassSource(
      source,
      'apps/server/api/src/services/example/example.service.ts',
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain('WorkflowExecutionQueueService');
  });

  it('allows @InjectQueue(WORKFLOW_BACKGROUND_QUEUE) inside WorkflowExecutionQueueService itself', () => {
    const source = `
      import { WORKFLOW_BACKGROUND_QUEUE } from '@genfeedai/contracts/queue';
      import { InjectQueue } from '@nestjs/bullmq';

      class WorkflowExecutionQueueService {
        constructor(@InjectQueue(WORKFLOW_BACKGROUND_QUEUE) private readonly queue: Queue) {}
      }
    `;

    expect(
      analyzeWorkflowDispatchClassSource(
        source,
        'apps/server/api/src/collections/workflows/services/workflow-execution-queue.service.ts',
      ),
    ).toEqual([]);
  });

  it('allows the documented #5162 boot-drain @InjectQueue(WORKFLOW_EXECUTION_QUEUE)', () => {
    const source = `
      import { WORKFLOW_EXECUTION_QUEUE } from '@genfeedai/contracts/queue';
      import { InjectQueue } from '@nestjs/bullmq';

      class PlatformScheduleRegistryService {
        constructor(@InjectQueue(WORKFLOW_EXECUTION_QUEUE) private readonly queue: Queue) {}
      }
    `;

    expect(
      analyzeWorkflowDispatchClassSource(
        source,
        'apps/server/workers/src/scheduling/platform-schedule-registry.service.ts',
      ),
    ).toEqual([]);
  });

  it('ignores an unrelated queue token on @InjectQueue', () => {
    const source = `
      import { HEYGEN_POLL_QUEUE } from '@genfeedai/contracts/queue';
      import { InjectQueue } from '@nestjs/bullmq';

      class HeygenPollQueueService {
        constructor(@InjectQueue(HEYGEN_POLL_QUEUE) private readonly queue: Queue) {}
      }
    `;

    expect(
      analyzeWorkflowDispatchClassSource(
        source,
        'apps/server/api/src/queues/heygen-poll/heygen-poll-queue.service.ts',
      ),
    ).toEqual([]);
  });

  it('excludes system-workflow-for-each.util.ts from the call-shape check (its queueSystemWorkflow param is a narrower callback, not the real service method)', () => {
    const source = `
      export async function scheduleForEach(input) {
        const jobId = await input.queueSystemWorkflow(
          workflow,
          jobId,
          { delayMs: 0 },
        );
      }
    `;

    expect(
      analyzeWorkflowDispatchClassSource(
        source,
        'apps/server/api/src/collections/workflows/system-workflow-for-each.util.ts',
      ),
    ).toEqual([]);
  });

  it('ignores an unrelated method also named queueSystemWorkflow-like but different', () => {
    const source = `
      class Producer {
        async run() {
          await this.other.queueSomethingElse(input, jobId);
        }
      }
    `;

    expect(
      analyzeWorkflowDispatchClassSource(
        source,
        'apps/server/api/src/services/example/example.service.ts',
      ),
    ).toEqual([]);
  });
});
