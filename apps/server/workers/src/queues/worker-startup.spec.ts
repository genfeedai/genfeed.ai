vi.hoisted(() => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('PORT', '3013');
  vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/genfeed');
});

import net from 'node:net';
import {
  SCHEDULED_POST_ACTION_IDS,
  SCHEDULED_POST_FAILURE_WORKFLOW_ID,
  SCHEDULED_POST_WORKFLOW_ID,
} from '@api/collections/posts/services/scheduled-post-workflow-definition';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { WORKFLOW_ENGINE_ADAPTER } from '@api/collections/workflows/workflows.tokens';
import { QueuesModule } from '@api/queues/core/queues.module';
import { ConfigService as ApiConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BullModule,
  BullRegistrar,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq';
import { type DynamicModule, type Type } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { NestFactory } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@workers/config/config.service';
import { WorkersQueuesModule } from '@workers/queues/queues.module';
import { ScheduledPostWorkflowService } from '@workers/services/scheduled-post-workflow.service';
import { Queue } from 'bullmq';

vi.mock('@libs/bootstrap', () => ({ bootstrap: vi.fn() }));
vi.mock('@workers/instrument', () => ({}));
vi.mock('@workers/app.module', () => ({ AppModule: class AppModule {} }));
vi.mock('express', () => ({
  default: () => ({
    get: vi.fn(),
    listen: (_port: number, listening: () => void) => {
      queueMicrotask(listening);
      return { on: vi.fn() };
    },
  }),
}));

const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const redisAvailable = await new Promise<boolean>((resolve) => {
  const url = new URL(redisUrl);
  const socket = net.connect({
    host: url.hostname,
    port: Number(url.port || 6379),
    timeout: 500,
  });
  const finish = (isAvailable: boolean) => {
    socket.destroy();
    resolve(isAvailable);
  };
  socket.once('connect', () => finish(true));
  socket.once('error', () => finish(false));
  socket.once('timeout', () => finish(false));
  it('never consumes if definition registration fails', async () => {
    const fixture = await createStartupFixture('registration');
    const register = vi.spyOn(fixture.registrar, 'register');

    try {
      await expect(fixture.module.init()).rejects.toThrow(
        'Definition registration failed',
      );
      expect(register).not.toHaveBeenCalled();
      expect(fixture.observations).toEqual([]);
      expect(await fixture.job.getState()).toBe('waiting');
    } finally {
      await fixture.module.close();
      await fixture.queue.obliterate({ force: true });
      await fixture.queue.close();
    }
  });
});

if (!redisAvailable && process.env.CI) {
  throw new Error(
    'Worker startup lifecycle tests require the CI Redis service.',
  );
}

function queueRoot(owner: Type<object>): DynamicModule {
  const imports: unknown[] =
    Reflect.getMetadata(MODULE_METADATA.IMPORTS, owner) ?? [];
  const root = imports.find(
    (entry): entry is DynamicModule =>
      typeof entry === 'object' &&
      entry !== null &&
      'module' in entry &&
      entry.module === BullModule &&
      'global' in entry &&
      entry.global === true,
  );
  if (!root) throw new Error(`Missing actual Bull root on ${owner.name}`);
  return root;
}

async function createStartupFixture(
  failure: 'none' | 'registration' | 'validation' = 'none',
  isApiRootLast = true,
) {
  const queueName = `worker-startup-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const queue = new Queue(queueName, { connection: { url: redisUrl } });
  const job = await queue.add('already-waiting', {}, { attempts: 1 });
  const actionIds = new Set<string>();
  const observations: Array<{
    failure: boolean;
    publish: boolean;
    terminalHandler: boolean;
    validated: boolean;
  }> = [];
  let isValidated = false;

  @Processor(queueName)
  class StartupProcessor extends WorkerHost {
    constructor(private readonly runner: SystemWorkflowRunnerService) {
      super();
    }

    async process(): Promise<void> {
      observations.push({
        failure: Boolean(
          this.runner.getWorkflow(SCHEDULED_POST_FAILURE_WORKFLOW_ID),
        ),
        publish: Boolean(this.runner.getWorkflow(SCHEDULED_POST_WORKFLOW_ID)),
        terminalHandler: terminalRegistration.mock.calls.some(
          ([canonicalId]) => canonicalId === SCHEDULED_POST_WORKFLOW_ID,
        ),
        validated: isValidated,
      });
    }
  }

  const roots = [queueRoot(WorkersQueuesModule), queueRoot(QueuesModule)];
  const config = {
    get: (key: string) =>
      key === 'REDIS_URL' ? redisUrl : key === 'PORT' ? 0 : undefined,
    isProduction: false,
    isStaging: false,
  };
  const logger = { debug: vi.fn(), error: vi.fn(), warn: vi.fn() };
  const module = await Test.createTestingModule({
    imports: [
      ...(isApiRootLast ? roots : [...roots].reverse()),
      BullModule.registerQueue({ name: queueName }),
    ],
    providers: [
      SystemWorkflowRunnerService,
      ScheduledPostWorkflowService,
      StartupProcessor,
      { provide: LoggerService, useValue: logger },
      {
        provide: WORKFLOW_ENGINE_ADAPTER,
        useValue: {
          getRegisteredActionIds: () => [...actionIds],
          registerExecutor: (actionId: string) => {
            actionIds.add(actionId);
          },
        },
      },
      { provide: ConfigService, useValue: config },
    ],
  })
    .overrideProvider(ApiConfigService)
    .useValue(config)
    .overrideProvider(ConfigService)
    .useValue(config)
    .useMocker(() => ({}))
    .compile();

  const runner = module.get(SystemWorkflowRunnerService);
  const terminalRegistration = vi.spyOn(runner.terminalFailures, 'register');
  const scheduledPosts = module.get(ScheduledPostWorkflowService);
  const registerDefinitions = scheduledPosts.onModuleInit.bind(scheduledPosts);
  vi.spyOn(scheduledPosts, 'onModuleInit').mockImplementation(async () => {
    // Make the initialization window deterministic while a job is waiting.
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (failure === 'registration')
      throw new Error('Definition registration failed');
    registerDefinitions();
    if (failure === 'none')
      runner.registerAction(SCHEDULED_POST_ACTION_IDS.DELIVER, () => undefined);
  });
  const validate = runner.onApplicationBootstrap.bind(runner);
  vi.spyOn(runner, 'onApplicationBootstrap').mockImplementation(() => {
    validate();
    isValidated = true;
  });

  return {
    job,
    logger,
    module,
    observations,
    queue,
    registrar: module.get(BullRegistrar),
  };
}

describe.skipIf(!redisAvailable)(
  'worker startup readiness (real Nest and BullMQ)',
  () => {
    afterEach(() => vi.restoreAllMocks());

    it('starts the waiting job exactly once from main after definitions, handlers and validation', async () => {
      const fixture = await createStartupFixture();
      const previousTerm = process.listeners('SIGTERM');
      const previousInt = process.listeners('SIGINT');
      const register = vi.spyOn(fixture.registrar, 'register');
      vi.spyOn(NestFactory, 'createApplicationContext').mockImplementation(
        async () => {
          await fixture.module.init();
          return fixture.module;
        },
      );

      try {
        await import('@workers/main');
        await vi.waitFor(
          async () => {
            expect(await fixture.job.getState()).toBe('completed');
          },
          { timeout: 5000 },
        );
        expect(fixture.observations).toEqual([
          {
            failure: true,
            publish: true,
            terminalHandler: true,
            validated: true,
          },
        ]);
        expect(register).toHaveBeenCalledTimes(1);
      } finally {
        for (const listener of process.listeners('SIGTERM')) {
          if (!previousTerm.includes(listener))
            process.removeListener('SIGTERM', listener);
        }
        for (const listener of process.listeners('SIGINT')) {
          if (!previousInt.includes(listener))
            process.removeListener('SIGINT', listener);
        }
        await fixture.module.close();
        await fixture.queue.obliterate({ force: true });
        await fixture.queue.close();
      }
    });

    it.each([true, false])(
      'never consumes if workflow validation fails (API root last: %s)',
      async (isApiRootLast) => {
        const fixture = await createStartupFixture('validation', isApiRootLast);
        const register = vi.spyOn(fixture.registrar, 'register');

        try {
          await expect(fixture.module.init()).rejects.toThrow(
            'System workflow action executors missing:',
          );
          expect(register).not.toHaveBeenCalled();
          expect(fixture.observations).toEqual([]);
          expect(await fixture.job.getState()).toBe('waiting');
        } finally {
          await fixture.module.close();
          await fixture.queue.obliterate({ force: true });
          await fixture.queue.close();
        }
      },
    );
  },
);
