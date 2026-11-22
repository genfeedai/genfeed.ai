import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findTestModuleProviderViolations } from './check-test-module-providers';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

/**
 * A miniature of the API harness: `E2ETestModule.forRoot` builds a module from
 * default stand-ins plus the caller's `controllers` and `providers`, and
 * `forTasks` forwards to it, exactly as `apps/server/api/test/e2e-test.module.ts`
 * does.
 */
const HARNESS_MODULE = `
import { LoggerService } from '../src/logger.service';

export const DEFAULT_PROVIDERS = [
  { provide: LoggerService, useValue: {} },
];

export class E2ETestModule {
  static async forRoot(options: { controllers?: unknown[]; providers?: unknown[] } = {}) {
    const { controllers = [], providers = [] } = options;
    return {
      controllers,
      module: E2ETestModule,
      providers: [...DEFAULT_PROVIDERS, ...providers],
    };
  }

  static async forTasks(options: { providers?: unknown[] } = {}) {
    return E2ETestModule.forRoot({
      controllers: [TasksController],
      providers: [TasksService, ...(options.providers ?? [])],
    });
  }
}

import { TasksController } from '../src/tasks.controller';
import { TasksService } from '../src/tasks.service';
`;

const SOURCES: Record<string, string> = {
  'src/logger.service.ts': 'export class LoggerService {}\n',
  'src/post-group-idempotency.service.ts':
    'export class PostGroupIdempotencyService {}\n',
  'src/post-groups.service.ts': `
import { LoggerService } from './logger.service';
import { PostGroupIdempotencyService } from './post-group-idempotency.service';

export class PostGroupsService {
  constructor(
    private readonly logger: LoggerService,
    private readonly idempotency: PostGroupIdempotencyService,
  ) {}
}
`,
  'src/task-review-access.service.ts':
    'export class TaskReviewAccessService {}\n',
  'src/tasks.controller.ts': `
import { Optional } from '@nestjs/common';
import { LoggerService } from './logger.service';
import { TaskReviewAccessService } from './task-review-access.service';
import { TasksService } from './tasks.service';

export class TasksController {
  constructor(
    private readonly logger: LoggerService,
    private readonly tasks: TasksService,
    private readonly review: TaskReviewAccessService,
    @Optional() private readonly queue?: LoggerService,
  ) {}
}
`,
  'src/tasks.service.ts': `
import { LoggerService } from './logger.service';

export class TasksService {
  constructor(private readonly logger: LoggerService) {}
}
`,
  'src/queue-consumer.service.ts': `
import { InjectQueue } from '@nestjs/bullmq';
import { MAIL_QUEUE } from './queue-names';

export class QueueConsumerService {
  constructor(@InjectQueue(MAIL_QUEUE) private readonly mail: unknown) {}
}
`,
  'src/queue-names.ts': "export const MAIL_QUEUE = 'mail';\n",
  'src/token-consumer.service.ts': `
import { Inject } from '@nestjs/common';
import { RUNNER } from './tokens';

export class TokenConsumerService {
  constructor(@Inject(RUNNER) private readonly runner: unknown) {}
}
`,
  'src/tokens.ts': "export const RUNNER = Symbol('runner');\n",
  'test/e2e-test.module.ts': HARNESS_MODULE,
};

function project(harness: string): { file: string; root: string } {
  const root = mkdtempSync(path.join(tmpdir(), 'test-module-providers-'));
  directories.push(root);
  const files = { ...SOURCES, 'test/harness.spec.ts': harness };
  for (const [relative, source] of Object.entries(files)) {
    const target = path.join(root, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, source);
  }
  writeFileSync(
    path.join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        experimentalDecorators: true,
        module: 'esnext',
        moduleResolution: 'bundler',
        target: 'es2022',
      },
    }),
  );
  return { file: path.join(root, 'test/harness.spec.ts'), root };
}

function check(harness: string) {
  const { file, root } = project(harness);
  return findTestModuleProviderViolations({
    harnessFiles: [file],
    rootDir: root,
    tsconfigPath: path.join(root, 'tsconfig.json'),
  });
}

const HEADER = `
import { Test } from '@nestjs/testing';
import { E2ETestModule } from './e2e-test.module';
import { LoggerService } from '../src/logger.service';
import { PostGroupIdempotencyService } from '../src/post-group-idempotency.service';
import { PostGroupsService } from '../src/post-groups.service';
import { QueueConsumerService } from '../src/queue-consumer.service';
import { MAIL_QUEUE } from '../src/queue-names';
import { TokenConsumerService } from '../src/token-consumer.service';
import { RUNNER } from '../src/tokens';
import { getQueueToken } from '@nestjs/bullmq';
`;

describe('check-test-module-providers', () => {
  it('names a collaborator a service gained after the harness listed it (#10853)', () => {
    const result = check(`${HEADER}
      const moduleConfig = await E2ETestModule.forRoot({
        providers: [PostGroupsService],
      });
      await Test.createTestingModule({ imports: [moduleConfig] }).compile();
    `);

    expect(result.violations).toEqual([
      {
        definition: 'E2ETestModule.forRoot',
        file: path.join('test', 'harness.spec.ts'),
        line: expect.any(Number),
        missing: 'PostGroupIdempotencyService',
        neededBy: 'PostGroupsService',
        parameter: 'idempotency',
      },
    ]);
  });

  it('accepts the module once the collaborator is provided', () => {
    const result = check(`${HEADER}
      const moduleConfig = await E2ETestModule.forRoot({
        providers: [PostGroupsService, PostGroupIdempotencyService],
      });
      await Test.createTestingModule({ imports: [moduleConfig] }).compile();
    `);

    expect(result.violations).toEqual([]);
    expect(result.checked).toBeGreaterThan(0);
  });

  it('names a collaborator a controller gained behind a forX helper (#9986)', () => {
    const result = check(`${HEADER}
      await E2ETestModule.forTasks({ providers: [] });
    `);

    expect(result.violations).toEqual([
      expect.objectContaining({
        definition: 'E2ETestModule.forTasks',
        missing: 'TaskReviewAccessService',
        neededBy: 'TasksController',
        parameter: 'review',
      }),
    ]);
  });

  it('counts providers the caller passes through a forX helper', () => {
    const result = check(`${HEADER}
      import { TaskReviewAccessService } from '../src/task-review-access.service';
      await E2ETestModule.forTasks({ providers: [TaskReviewAccessService] });
    `);

    expect(result.violations).toEqual([]);
  });

  it('reads a Test.createTestingModule literal with no factory', () => {
    const result = check(`${HEADER}
      await Test.createTestingModule({
        providers: [PostGroupsService, { provide: LoggerService, useValue: {} }],
      }).compile();
    `);

    expect(result.violations.map((violation) => violation.missing)).toEqual([
      'PostGroupIdempotencyService',
    ]);
  });

  it('lets a stand-in listed after a real class replace it', () => {
    const result = check(`${HEADER}
      await E2ETestModule.forRoot({
        providers: [
          PostGroupsService,
          { provide: PostGroupsService, useValue: {} },
        ],
      });
    `);

    expect(result.violations).toEqual([]);
  });

  it('does not require an @Optional collaborator', () => {
    const result = check(`${HEADER}
      await E2ETestModule.forTasks({ providers: [] });
    `);

    expect(result.violations.map((violation) => violation.parameter)).toEqual([
      'review',
    ]);
  });

  it('names a missing queue token and accepts a provided one', () => {
    const missing = check(`${HEADER}
      await E2ETestModule.forRoot({ providers: [QueueConsumerService] });
    `);
    const provided = check(`${HEADER}
      await E2ETestModule.forRoot({
        providers: [
          QueueConsumerService,
          { provide: getQueueToken(MAIL_QUEUE), useValue: {} },
        ],
      });
    `);

    expect(missing.violations.map((violation) => violation.missing)).toEqual([
      'MAIL_QUEUE',
    ]);
    expect(provided.violations).toEqual([]);
  });

  it('reads queue tokens built by mapping over queue names', () => {
    const result = check(`${HEADER}
      await E2ETestModule.forRoot({
        providers: [
          QueueConsumerService,
          ...[MAIL_QUEUE].map((name) => ({
            provide: getQueueToken(name),
            useValue: {},
          })),
        ],
      });
    `);

    expect(result.violations).toEqual([]);
  });

  it('names a missing @Inject token', () => {
    const result = check(`${HEADER}
      await E2ETestModule.forRoot({ providers: [TokenConsumerService] });
    `);
    const fixed = check(`${HEADER}
      await E2ETestModule.forRoot({
        providers: [TokenConsumerService, { provide: RUNNER, useValue: {} }],
      });
    `);

    expect(result.violations.map((violation) => violation.missing)).toEqual([
      'RUNNER',
    ]);
    expect(fixed.violations).toEqual([]);
  });

  it('skips a module it cannot read completely instead of calling it clean', () => {
    const dynamicProviders = check(`${HEADER}
      declare const extra: unknown[];
      await E2ETestModule.forRoot({ providers: [PostGroupsService, ...extra] });
    `);
    const importedModule = check(`${HEADER}
      import { ConfigModule } from '@nestjs/config';
      await Test.createTestingModule({
        imports: [ConfigModule],
        providers: [PostGroupsService],
      }).compile();
    `);

    expect(dynamicProviders.violations).toEqual([]);
    expect(dynamicProviders.checked).toBe(0);
    expect(dynamicProviders.skipped).toHaveLength(1);
    expect(importedModule.violations).toEqual([]);
    expect(importedModule.checked).toBe(0);
    expect(importedModule.skipped).toHaveLength(1);
  });

  it('skips a gap an unreadable provider could fill', () => {
    const result = check(`${HEADER}
      declare const names: string[];
      await E2ETestModule.forRoot({
        providers: [
          PostGroupsService,
          ...names.map((name) => ({ provide: name, useValue: {} })),
        ],
      });
    `);

    expect(result.violations).toEqual([]);
    expect(result.skipped).toHaveLength(1);
  });

  it('keeps reporting a class gap beside queue providers built from a map', () => {
    const result = check(`${HEADER}
      declare const queues: Map<string, unknown>;
      await E2ETestModule.forRoot({
        providers: [
          PostGroupsService,
          ...[...queues].map(([name, queue]) => ({
            provide: getQueueToken(name),
            useValue: queue,
          })),
        ],
      });
    `);

    expect(result.violations.map((violation) => violation.missing)).toEqual([
      'PostGroupIdempotencyService',
    ]);
  });
});
