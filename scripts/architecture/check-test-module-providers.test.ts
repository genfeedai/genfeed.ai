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

  /** A module that keeps its providers private except for what it exports. */
  static async forPrivate(options: { providers?: unknown[] } = {}) {
    return {
      exports: [LoggerService],
      module: E2ETestModule,
      providers: [...DEFAULT_PROVIDERS, ...(options.providers ?? [])],
    };
  }

  static async forLooping() {
    return E2ETestModule.forLooping();
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
  'src/tokens.ts': `
export const RUNNER = Symbol('runner');
export const MAYBE = 'maybe';
export const OTHER_RUNNER = Symbol('runner');
`,
  'src/alias-consumer.service.ts': `
import { Inject as InjectToken } from '@nestjs/common';
import { RUNNER } from './tokens';

export class AliasConsumerService {
  constructor(@InjectToken(RUNNER) private readonly runner: unknown) {}
}
`,
  'src/optional-consumer.service.ts': `
import { Inject, Optional } from '@nestjs/common';
import { MAYBE } from './tokens';

export class OptionalConsumerService {
  constructor(@Optional() @Inject(MAYBE) private readonly maybe?: unknown) {}
}
`,
  'src/required-consumer.service.ts': `
import { Inject } from '@nestjs/common';
import { MAYBE } from './tokens';

export class RequiredConsumerService {
  constructor(@Inject(MAYBE) private readonly maybe: unknown) {}
}
`,
  'src/existing-consumer.service.ts': `
import { LoggerService } from './logger.service';

export class ExistingConsumerService {
  constructor(private readonly logger: LoggerService) {}
}
`,
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
import { AliasConsumerService } from '../src/alias-consumer.service';
import { ExistingConsumerService } from '../src/existing-consumer.service';
import { OptionalConsumerService } from '../src/optional-consumer.service';
import { RequiredConsumerService } from '../src/required-consumer.service';
import { TokenConsumerService } from '../src/token-consumer.service';
import { MAYBE, OTHER_RUNNER, RUNNER } from '../src/tokens';
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
    expect(result.checked).toBe(2);
    expect(result.skipped).toEqual([]);
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
    expect(result.checked).toBe(1);
    expect(result.skipped).toEqual([]);
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
    expect(result.checked).toBe(1);
    expect(result.skipped).toEqual([]);
  });

  it('does not require an @Optional collaborator, and requires the same token without it', () => {
    const optional = check(`${HEADER}
      await E2ETestModule.forRoot({ providers: [OptionalConsumerService] });
    `);
    const required = check(`${HEADER}
      await E2ETestModule.forRoot({ providers: [RequiredConsumerService] });
    `);

    expect(optional.violations).toEqual([]);
    expect(optional.checked).toBe(1);
    expect(required.violations.map((violation) => violation.missing)).toEqual([
      'MAYBE',
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
    expect(provided.checked).toBe(1);
    expect(provided.skipped).toEqual([]);
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
    expect(result.checked).toBe(1);
    expect(result.skipped).toEqual([]);
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
    expect(fixed.checked).toBe(1);
    expect(fixed.skipped).toEqual([]);
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
  it('matches a string constant to the literal it holds, and keeps symbols apart', () => {
    const byLiteral = check(`${HEADER}
      await E2ETestModule.forRoot({
        providers: [RequiredConsumerService, { provide: 'maybe', useValue: {} }],
      });
    `);
    const byConstant = check(`${HEADER}
      await E2ETestModule.forRoot({
        providers: [RequiredConsumerService, { provide: MAYBE, useValue: {} }],
      });
    `);
    const otherSymbol = check(`${HEADER}
      await E2ETestModule.forRoot({
        providers: [TokenConsumerService, { provide: OTHER_RUNNER, useValue: {} }],
      });
    `);

    expect(byLiteral.violations).toEqual([]);
    expect(byLiteral.checked).toBe(1);
    expect(byConstant.violations).toEqual([]);
    expect(byConstant.checked).toBe(1);
    expect(
      otherSymbol.violations.map((violation) => violation.missing),
    ).toEqual(['RUNNER']);
  });

  it('names the target of a useExisting alias', () => {
    const missing = check(`${HEADER}
      await E2ETestModule.forRoot({
        providers: [{ provide: 'alias', useExisting: ExistingConsumerService }],
      });
    `);
    const provided = check(`${HEADER}
      await E2ETestModule.forRoot({
        providers: [
          ExistingConsumerService,
          { provide: 'alias', useExisting: ExistingConsumerService },
        ],
      });
    `);

    expect(missing.violations).toEqual([
      expect.objectContaining({
        missing: 'ExistingConsumerService',
        neededBy: 'the provider for "alias"',
        parameter: 'inject',
      }),
    ]);
    expect(provided.violations).toEqual([]);
    expect(provided.checked).toBe(1);
  });

  it('checks the inject list of a factory provider that builds no class', () => {
    const missing = check(`${HEADER}
      await E2ETestModule.forRoot({
        providers: [
          {
            provide: 'client',
            useFactory: () => ({}),
            inject: [PostGroupIdempotencyService],
          },
        ],
      });
    `);
    const replaced = check(`${HEADER}
      await E2ETestModule.forRoot({
        providers: [
          {
            provide: 'client',
            useFactory: () => ({}),
            inject: [PostGroupIdempotencyService],
          },
          { provide: 'client', useValue: {} },
        ],
      });
    `);

    expect(missing.violations).toEqual([
      expect.objectContaining({
        missing: 'PostGroupIdempotencyService',
        neededBy: 'the provider for "client"',
      }),
    ]);
    expect(replaced.violations).toEqual([]);
    expect(replaced.checked).toBe(1);
  });

  it('expands a list spread at every site, so a later spread restores a replaced class', () => {
    const result = check(`${HEADER}
      const real = [PostGroupsService];
      await E2ETestModule.forRoot({
        providers: [...real, { provide: PostGroupsService, useValue: {} }, ...real],
      });
    `);

    expect(result.violations.map((violation) => violation.missing)).toEqual([
      'PostGroupIdempotencyService',
    ]);
  });

  it('follows only the branch that runs when the condition is known', () => {
    const dropped = check(`${HEADER}
      await E2ETestModule.forRoot({
        providers: [PostGroupsService, ...(false ? [PostGroupIdempotencyService] : [])],
      });
    `);
    const kept = check(`${HEADER}
      await E2ETestModule.forRoot({
        providers: [PostGroupsService, ...(true ? [PostGroupIdempotencyService] : [])],
      });
    `);
    const nullish = check(`${HEADER}
      await E2ETestModule.forRoot({
        providers: [PostGroupsService, ...([] ?? [PostGroupIdempotencyService])],
      });
    `);

    expect(dropped.violations.map((violation) => violation.missing)).toEqual([
      'PostGroupIdempotencyService',
    ]);
    expect(kept.violations).toEqual([]);
    expect(kept.checked).toBe(1);
    expect(nullish.violations.map((violation) => violation.missing)).toEqual([
      'PostGroupIdempotencyService',
    ]);
  });

  it('skips a gap that only a branch it cannot decide supplies', () => {
    const result = check(`${HEADER}
      declare const flag: boolean;
      await E2ETestModule.forRoot({
        providers: [PostGroupsService, ...(flag ? [PostGroupIdempotencyService] : [])],
      });
    `);

    expect(result.violations).toEqual([]);
    expect(result.checked).toBe(0);
    expect(result.skipped).toHaveLength(1);
  });

  it('does not treat slice, filter or a re-mapping map as a passthrough', () => {
    const sliced = check(`${HEADER}
      await E2ETestModule.forRoot({
        providers: [PostGroupsService, ...[PostGroupIdempotencyService].slice(1)],
      });
    `);
    const filtered = check(`${HEADER}
      await E2ETestModule.forRoot({
        providers: [
          PostGroupsService,
          ...[PostGroupIdempotencyService].filter(() => false),
        ],
      });
    `);
    const remapped = check(`${HEADER}
      await E2ETestModule.forRoot({
        providers: [
          PostGroupsService,
          ...[PostGroupIdempotencyService].map(() => LoggerService),
        ],
      });
    `);

    for (const result of [sliced, filtered, remapped]) {
      expect(result.violations).toEqual([]);
      expect(result.checked).toBe(0);
      expect(result.skipped).toHaveLength(1);
    }
  });

  it('keeps a provider list that a map returns unchanged or rebuilt', () => {
    const result = check(`${HEADER}
      await E2ETestModule.forRoot({
        providers: [
          ...[PostGroupsService, PostGroupIdempotencyService].map((provider) => {
            if (provider === PostGroupsService) {
              return { ...provider, useFactory: () => ({}) };
            }
            return provider;
          }),
        ],
      });
    `);

    expect(result.violations).toEqual([]);
    expect(result.checked).toBe(1);
  });

  it('keeps a module’s providers private unless it exports them', () => {
    const leaked = check(`${HEADER}
      const priv = await E2ETestModule.forPrivate({
        providers: [PostGroupIdempotencyService],
      });
      await Test.createTestingModule({
        imports: [priv],
        providers: [PostGroupsService],
      }).compile();
    `);
    const exported = check(`${HEADER}
      const priv = await E2ETestModule.forPrivate({
        providers: [PostGroupsService, PostGroupIdempotencyService],
      });
      await Test.createTestingModule({ imports: [priv] }).compile();
    `);

    expect(leaked.violations).toEqual([
      expect.objectContaining({
        definition: 'Test.createTestingModule',
        missing: 'PostGroupIdempotencyService',
        neededBy: 'PostGroupsService',
      }),
    ]);
    expect(exported.violations).toEqual([]);
    expect(exported.checked).toBe(2);
  });

  it('reads an options variable instead of treating it as omitted', () => {
    const readable = check(`${HEADER}
      const options = { providers: [PostGroupsService] };
      await E2ETestModule.forRoot(options);
    `);
    const unreadable = check(`${HEADER}
      declare const options: { providers: unknown[] };
      await E2ETestModule.forRoot(options);
    `);

    expect(readable.violations.map((violation) => violation.missing)).toEqual([
      'PostGroupIdempotencyService',
    ]);
    expect(unreadable.violations).toEqual([]);
    expect(unreadable.checked).toBe(0);
    expect(unreadable.skipped).toHaveLength(1);
  });

  it('reads spread metadata in assignment order and skips a spread it cannot read', () => {
    const spread = check(`${HEADER}
      const metadata = { providers: [PostGroupsService, LoggerService] };
      await Test.createTestingModule({ ...metadata }).compile();
    `);
    const overridden = check(`${HEADER}
      const metadata = { providers: [PostGroupsService] };
      await Test.createTestingModule({
        ...metadata,
        providers: [PostGroupsService, PostGroupIdempotencyService, LoggerService],
      }).compile();
    `);
    const unreadable = check(`${HEADER}
      declare const metadata: object;
      await Test.createTestingModule({
        providers: [PostGroupsService],
        ...metadata,
      }).compile();
    `);

    expect(spread.violations.map((violation) => violation.missing)).toEqual([
      'PostGroupIdempotencyService',
    ]);
    expect(overridden.violations).toEqual([]);
    expect(overridden.checked).toBe(1);
    expect(unreadable.violations).toEqual([]);
    expect(unreadable.skipped).toHaveLength(1);
  });

  it('does not recurse through a factory that calls itself', () => {
    const result = check(`${HEADER}
      await E2ETestModule.forLooping();
    `);

    expect(result.violations).toEqual([]);
    expect(result.checked).toBe(0);
    expect(result.skipped).toHaveLength(1);
  });

  it('reads a Nest decorator through the name it is imported as', () => {
    const result = check(`${HEADER}
      await E2ETestModule.forRoot({ providers: [AliasConsumerService] });
    `);

    expect(result.violations.map((violation) => violation.missing)).toEqual([
      'RUNNER',
    ]);
  });

  it('reports a queue it cannot look up as skipped, and still reports other gaps', () => {
    const result = check(`${HEADER}
      declare const queues: Map<string, unknown>;
      await E2ETestModule.forRoot({
        providers: [
          QueueConsumerService,
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
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.reason).toContain('queue');
  });

  it('skips an unreadable-provider definition whichever order the file lists it in', () => {
    const result = check(`${HEADER}
      declare const names: string[];
      await E2ETestModule.forRoot({ providers: [PostGroupsService] });
      await E2ETestModule.forRoot({
        providers: [
          PostGroupsService,
          ...names.map((name) => ({ provide: name, useValue: {} })),
        ],
      });
    `);

    expect(result.violations).toHaveLength(1);
    expect(result.checked).toBe(1);
    expect(result.skipped).toHaveLength(1);
  });

  it('skips a module whose compile is given a mocker', () => {
    const mocked = check(`${HEADER}
      await Test.createTestingModule({ providers: [PostGroupsService] })
        .useMocker(() => ({}))
        .compile();
    `);

    expect(mocked.violations).toEqual([]);
    expect(mocked.checked).toBe(0);
    expect(mocked.skipped).toHaveLength(1);
  });
});
