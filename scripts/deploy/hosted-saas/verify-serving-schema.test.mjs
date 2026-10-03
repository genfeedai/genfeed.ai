import assert from 'node:assert/strict';
import test from 'node:test';
import {
  servingImages,
  verifyServingSchemas,
} from './verify-serving-schema.mjs';

const repository = '123456789012.dkr.ecr.eu-west-1.amazonaws.com/server';
const digest = `sha256:${'a'.repeat(64)}`;
const oldDigest = `sha256:${'b'.repeat(64)}`;
const drainingDigest = `sha256:${'c'.repeat(64)}`;
const candidate = 'a'.repeat(40);
const active = 'b'.repeat(40);
const schema =
  'model Example {\n id String @id\n retained String\n @@map("examples")\n}\n';
const retirement =
  '-- genfeed-contract-after: v0.2.0\nALTER TABLE "examples" DROP COLUMN "retained";';

function awsResult(args) {
  if (args.includes('describe-services'))
    return {
      services: [
        {
          desiredCount: 1,
          taskDefinition: 'new',
          deployments: [
            { status: 'PRIMARY', taskDefinition: 'new' },
            { status: 'ACTIVE', taskDefinition: 'old' },
          ],
        },
      ],
    };
  if (args.includes('describe-task-definition'))
    return {
      taskDefinition: {
        containerDefinitions: [
          {
            image: `${repository}@${args.includes('old') ? oldDigest : digest}`,
          },
        ],
      },
    };
  if (args.includes('list-tasks'))
    return {
      taskArns: args.includes('STOPPED')
        ? ['draining', 'stopped']
        : ['running', 'pending'],
    };
  if (args.includes('describe-tasks'))
    return {
      tasks: args
        .slice(args.indexOf('--tasks') + 1, args.indexOf('--output'))
        .map((arn) => ({
          lastStatus:
            arn === 'stopped'
              ? 'STOPPED'
              : arn === 'pending'
                ? 'PENDING'
                : 'RUNNING',
          containers: [
            {
              image: `${repository}@${arn === 'draining' ? drainingDigest : digest}`,
            },
          ],
        })),
    };
  throw new Error(`unexpected AWS ${args}`);
}

test('checks PRIMARY, ACTIVE, pending, and draining tasks, ignoring stopped tasks', () => {
  const images = servingImages({
    cluster: 'cluster',
    services: ['api'],
    repository,
    execute: (_, args) => JSON.stringify(awsResult(args)),
  });
  assert.deepEqual(
    images.sort(),
    [digest, oldDigest, drainingDigest]
      .map((value) => `${repository}@${value}`)
      .sort(),
  );
});

test('fails closed on missing tasks, service failures, and mutable image references', () => {
  for (const failure of ['tasks', 'services', 'mutable']) {
    assert.throws(() =>
      servingImages({
        cluster: 'cluster',
        services: ['api'],
        repository,
        execute: (_, args) => {
          const result = awsResult(args);
          if (failure === 'tasks' && args.includes('describe-tasks'))
            result.tasks = [];
          if (failure === 'services' && args.includes('describe-services'))
            result.failures = [{ reason: 'MISSING' }];
          if (
            failure === 'mutable' &&
            args.includes('describe-task-definition')
          )
            result.taskDefinition.containerDefinitions = [
              { image: `${repository}:latest` },
            ];
          return JSON.stringify(result);
        },
      }),
    );
  }
});

function verifyFixture({
  direction = 'forward',
  sql = retirement,
  activeSchema = schema,
  candidateSchema = schema,
  revisions = [candidate],
} = {}) {
  const commands = [];
  const file =
    'packages/prisma/prisma/migrations/20261004000000_contract/migration.sql';
  const execute = (command, args) => {
    commands.push({ command, args });
    if (command === 'aws') return JSON.stringify(awsResult(args));
    if (command === 'docker')
      return JSON.stringify(
        revisions.map((sha) => ({
          config: {
            Labels: {
              'org.opencontainers.image.revision':
                args[3] === `${repository}@${digest}` ? sha : active,
            },
          },
        })),
      );
    if (command === 'git') {
      if (args[0] === 'fetch') return '';
      if (args[0] === 'diff') {
        const isForward = args[4] === candidate;
        return (direction === 'forward' ? isForward : !isForward)
          ? `A\t${file}`
          : `D\t${file}`;
      }
      if (args[0] === 'show')
        return args[1].endsWith('schema.prisma')
          ? args[1].startsWith(`${candidate}:`)
            ? candidateSchema
            : activeSchema
          : sql;
    }
    throw new Error(`unexpected ${command} ${args}`);
  };
  return {
    commands,
    run: () =>
      verifyServingSchemas({
        cluster: 'cluster',
        services: ['api', 'workers'],
        repository,
        candidateDigest: digest,
        cwd: '/fixture',
        execute,
      }),
  };
}

test('rejects a contract while any active client still selects its target', () => {
  assert.throws(verifyFixture().run, /incompatible/);
  assert.throws(
    verifyFixture({ sql: 'ALTER TABLE "examples" DROP COLUMN "retained";' })
      .run,
    /requires exactly one/,
  );
  assert.equal(
    verifyFixture({
      activeSchema: schema.replace(' retained String\n', ''),
    }).run().candidate,
    candidate,
  );
});

test('rejects rollback clients that read fields already contracted by the active release', () => {
  assert.throws(verifyFixture({ direction: 'rollback' }).run, /incompatible/);
  assert.equal(
    verifyFixture({
      direction: 'rollback',
      candidateSchema: schema.replace(' retained String\n', ''),
    }).run().candidate,
    candidate,
  );
});

test('requires exact OCI revision metadata and performs only read operations', () => {
  for (const revisions of [[], ['latest'], [candidate, active]])
    assert.throws(
      verifyFixture({ revisions }).run,
      /exact verified OCI source/,
    );
  const fixture = verifyFixture({
    sql: 'ALTER TABLE "examples" ADD COLUMN "optional" TEXT;',
  });
  assert.equal(fixture.run().servingImages, 3);
  assert.ok(
    fixture.commands.every(
      ({ command, args }) =>
        command === 'git' ||
        (command === 'docker' && args.includes('inspect')) ||
        (command === 'aws' && /^(describe-|list-)/.test(args[1])),
    ),
  );
  assert.ok(
    fixture.commands.some(
      ({ command, args }) =>
        command === 'git' && args[0] === 'fetch' && args[3] === active,
    ),
  );
});
