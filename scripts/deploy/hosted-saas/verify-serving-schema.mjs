import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { validateContract } from '../../ci/migration-safety.mjs';
import { imageRevisions } from '../../ci/resolve-server-image.mjs';

const SCHEMA = 'packages/prisma/prisma/schema.prisma';
const MIGRATIONS = 'packages/prisma/prisma/migrations/';
const SHA = /^[0-9a-f]{40}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const ECR =
  /^\d{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com(?:\.cn)?\/[a-z0-9][a-z0-9._/-]*$/;

// Only metadata is fetched: no image pull, task launch, or database access.
export function servingImages({ cluster, services, repository, execute }) {
  const images = new Set();
  const aws = (args) =>
    JSON.parse(execute('aws', ['ecs', ...args, '--output', 'json']));
  const addImage = (image, digest) => {
    if (
      !image?.startsWith(`${repository}@`) &&
      !image?.startsWith(`${repository}:`)
    )
      return false;
    const pinned = image.startsWith(`${repository}@`)
      ? image.slice(repository.length + 1)
      : digest;
    if (!DIGEST.test(pinned ?? ''))
      throw new Error('Serving image must resolve to an immutable digest');
    images.add(`${repository}@${pinned}`);
    return true;
  };
  for (const serviceName of services) {
    const result = aws([
      'describe-services',
      '--cluster',
      cluster,
      '--services',
      serviceName,
    ]);
    if (result.failures?.length || result.services?.length !== 1)
      throw new Error(`Cannot prove serving service ${serviceName}`);
    const service = result.services[0];
    const definitions = new Set();
    if (
      service.desiredCount > 0 ||
      service.runningCount > 0 ||
      service.pendingCount > 0
    )
      definitions.add(service.taskDefinition);
    for (const deployment of service.deployments ?? []) {
      if (
        deployment.status === 'PRIMARY' ||
        deployment.status === 'ACTIVE' ||
        deployment.runningCount > 0 ||
        deployment.pendingCount > 0
      )
        definitions.add(deployment.taskDefinition);
    }
    for (const taskSet of service.taskSets ?? []) {
      if (
        taskSet.status === 'PRIMARY' ||
        taskSet.status === 'ACTIVE' ||
        taskSet.runningCount > 0 ||
        taskSet.pendingCount > 0
      )
        definitions.add(taskSet.taskDefinition);
    }
    for (const taskDefinition of definitions) {
      if (!taskDefinition)
        throw new Error('Serving task definition is missing');
      const result = aws([
        'describe-task-definition',
        '--task-definition',
        taskDefinition,
      ]);
      if (
        !result.taskDefinition?.containerDefinitions
          ?.map((container) => addImage(container.image))
          .some(Boolean)
      )
        throw new Error('Serving task definition has no provable server image');
    }
    // Describe actual live tasks as well: a service's latest task definition
    // omits older revisions still draining or pending in an overlapping roll.
    const taskArns = new Set();
    for (const desiredStatus of ['RUNNING', 'STOPPED']) {
      const listed = aws([
        'list-tasks',
        '--cluster',
        cluster,
        '--service-name',
        serviceName,
        '--desired-status',
        desiredStatus,
      ]);
      if (!Array.isArray(listed.taskArns))
        throw new Error('Cannot enumerate live serving tasks');
      for (const arn of listed.taskArns) taskArns.add(arn);
    }
    const listed = [...taskArns];
    for (let i = 0; i < listed.length; i += 100) {
      const result = aws([
        'describe-tasks',
        '--cluster',
        cluster,
        '--tasks',
        ...listed.slice(i, i + 100),
      ]);
      if (
        result.failures?.length ||
        result.tasks?.length !== Math.min(100, listed.length - i)
      )
        throw new Error('Cannot prove every live task revision');
      for (const task of result.tasks) {
        if (task.lastStatus === 'STOPPED') continue;
        if (
          !task.containers
            ?.map((container) =>
              addImage(container.image, container.imageDigest),
            )
            .some(Boolean)
        )
          throw new Error('Live task has no provable server image');
      }
    }
  }
  return [...images];
}

export function verifyServingSchemas({
  cluster,
  services,
  repository,
  candidateDigest,
  cwd,
  execute = (command, args) =>
    execFileSync(command, args, {
      cwd,
      encoding: 'utf8',
      timeout: 120_000,
      maxBuffer: 16 * 1024 * 1024,
    }),
}) {
  if (
    !ECR.test(repository ?? '') ||
    !DIGEST.test(candidateDigest ?? '') ||
    !cluster ||
    !Array.isArray(services) ||
    !services.length ||
    services.some((service) => typeof service !== 'string' || !service)
  )
    throw new Error('Invalid serving-schema verification inputs');
  const git = (args) => execute('git', args).trim();
  const revisions = new Map();
  const revision = (image) => {
    if (!revisions.has(image)) {
      const metadata = JSON.parse(
        execute('docker', [
          'buildx',
          'imagetools',
          'inspect',
          image,
          '--format',
          '{{json .Image}}',
        ]),
      );
      const found = [...new Set(imageRevisions(metadata))];
      if (found.length !== 1 || !SHA.test(found[0]))
        throw new Error('Image lacks one exact verified OCI source revision');
      git(['fetch', '--no-tags', 'origin', found[0]]);
      revisions.set(image, found[0]);
    }
    return revisions.get(image);
  };
  const candidate = revision(`${repository}@${candidateDigest}`);
  const candidateSchema = git(['show', `${candidate}:${SCHEMA}`]);
  const images = servingImages({ cluster, services, repository, execute });
  for (const image of images) {
    const active = revision(image);
    if (active === candidate) continue;
    const activeSchema = git(['show', `${active}:${SCHEMA}`]);
    // Forward migrations must preserve all clients still serving. In the
    // reverse direction, a rollback must not select fields already contracted
    // by the active release. No marker can exempt the actual client schema.
    for (const [from, to, schema] of [
      [active, candidate, activeSchema],
      [candidate, active, candidateSchema],
    ]) {
      const changed = git([
        'diff',
        '--name-status',
        '--no-renames',
        from,
        to,
        '--',
        MIGRATIONS,
      ]);
      for (const row of changed.split('\n').filter(Boolean)) {
        const [status, file] = row.split('\t');
        if (!file?.endsWith('/migration.sql') || status === 'D') continue;
        if (status !== 'A')
          throw new Error('Image revisions disagree on applied migration SQL');
        validateContract(git(['show', `${to}:${file}`]), schema);
      }
    }
  }
  return { candidate, servingImages: images.length };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const { values } = parseArgs({
      options: {
        cluster: { type: 'string' },
        services: { type: 'string' },
        repository: { type: 'string' },
        'candidate-digest': { type: 'string' },
        cwd: { type: 'string' },
      },
    });
    const result = verifyServingSchemas({
      ...values,
      services: JSON.parse(values.services),
      candidateDigest: values['candidate-digest'],
    });
    process.stdout.write(
      `Serving schema compatibility verified for ${result.servingImages} image revision(s), candidate ${result.candidate}.\n`,
    );
  } catch (error) {
    process.stderr.write(
      `Serving schema compatibility failed: ${error.message}\n`,
    );
    process.exitCode = 1;
  }
}
