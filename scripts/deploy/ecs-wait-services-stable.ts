#!/usr/bin/env bun
/**
 * Bounded ECS service rollout waiter for the production deploy pipeline.
 *
 * The AWS CLI `ecs wait services-stable` waiter has a fixed ~10 minute window,
 * waits one service at a time, and reports only "max attempts exceeded". This
 * waiter observes every service concurrently, tracks the deployment that was
 * PRIMARY when polling began, fails fast when ECS rolls it back, and prints
 * service/task diagnostics on failure.
 */

import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import {
  DescribeServicesCommand,
  DescribeTasksCommand,
  ECSClient,
  ListTasksCommand,
} from '@aws-sdk/client-ecs';
import {
  type RetryOptions,
  UsageError,
  withTransientRetry,
} from './ecs-run-task-and-wait';

export const SERVICE_EXIT = {
  SUCCESS: 0,
  ROLLOUT_FAILURE: 1,
  TIMEOUT: 2,
  API_FAILURE: 3,
  USAGE_ERROR: 5,
} as const;
export type ServiceExitCode =
  (typeof SERVICE_EXIT)[keyof typeof SERVICE_EXIT];

export interface ServiceDeployment {
  id: string | null;
  status: string | null;
  rolloutState: string | null;
  rolloutStateReason: string | null;
  taskDefinition: string | null;
  desiredCount: number;
  runningCount: number;
  pendingCount: number;
}

export interface ServiceEvent {
  createdAt: string | null;
  message: string;
}

export interface ServiceSnapshot {
  name: string;
  desiredCount: number;
  runningCount: number;
  pendingCount: number;
  taskDefinition: string | null;
  deployments: ServiceDeployment[];
  events: ServiceEvent[];
}

export interface ContainerDiagnostic {
  name: string | null;
  lastStatus: string | null;
  exitCode: number | null;
  reason: string | null;
}

export interface TaskDiagnostic {
  taskArn: string;
  taskDefinition: string | null;
  lastStatus: string | null;
  desiredStatus: string | null;
  healthStatus: string | null;
  stopCode: string | null;
  stoppedReason: string | null;
  containers: ContainerDiagnostic[];
}

export interface ServiceGateway {
  describeServices(args: {
    cluster: string;
    services: string[];
  }): Promise<ServiceSnapshot[]>;
  describeServiceTasks(args: {
    cluster: string;
    service: string;
  }): Promise<TaskDiagnostic[]>;
}

export interface WaitForServicesOptions {
  cluster: string;
  services: string[];
  timeoutSeconds: number;
  pollSeconds: number;
  apiRetries?: number;
  retryBaseDelayMs?: number;
  sleepFn?: (ms: number) => Promise<void>;
  nowFn?: () => number;
  log?: (line: string) => void;
}

export interface WaitForServicesResult {
  code: ServiceExitCode;
  message: string;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function deploymentKey(deployment: ServiceDeployment): string {
  return (
    deployment.id ??
    deployment.taskDefinition ??
    `${deployment.status ?? 'unknown'}:${deployment.desiredCount}`
  );
}

function primaryDeployment(
  snapshot: ServiceSnapshot,
): ServiceDeployment | undefined {
  return snapshot.deployments.find(
    (deployment) => deployment.status === 'PRIMARY',
  );
}

function serviceState(
  snapshot: ServiceSnapshot,
  targetDeploymentKey: string,
): string {
  const primary = primaryDeployment(snapshot);
  const target = snapshot.deployments.find(
    (deployment) => deploymentKey(deployment) === targetDeploymentKey,
  );
  return [
    `desired=${snapshot.desiredCount}`,
    `running=${snapshot.runningCount}`,
    `pending=${snapshot.pendingCount}`,
    `deployments=${snapshot.deployments.length}`,
    `primary=${primary?.rolloutState ?? 'UNKNOWN'}`,
    `target=${target?.rolloutState ?? (target ? 'UNKNOWN' : 'MISSING')}`,
  ].join(' ');
}

function isStable(
  snapshot: ServiceSnapshot,
  targetDeploymentKey: string,
): boolean {
  const primary = primaryDeployment(snapshot);
  return (
    snapshot.deployments.length === 1 &&
    primary !== undefined &&
    deploymentKey(primary) === targetDeploymentKey &&
    primary.rolloutState !== 'FAILED' &&
    snapshot.runningCount === snapshot.desiredCount &&
    snapshot.pendingCount === 0
  );
}

function rolloutFailure(
  snapshot: ServiceSnapshot,
  targetDeploymentKey: string,
): string | null {
  const primary = primaryDeployment(snapshot);
  const target = snapshot.deployments.find(
    (deployment) => deploymentKey(deployment) === targetDeploymentKey,
  );

  if (target?.rolloutState === 'FAILED') {
    return (
      target.rolloutStateReason ??
      `deployment ${targetDeploymentKey} entered FAILED`
    );
  }

  if (!target && primary && deploymentKey(primary) !== targetDeploymentKey) {
    return `deployment ${targetDeploymentKey} disappeared and ECS selected ${deploymentKey(primary)} as PRIMARY`;
  }

  if (
    target &&
    primary &&
    deploymentKey(primary) !== targetDeploymentKey &&
    target.status !== 'PRIMARY'
  ) {
    return `deployment ${targetDeploymentKey} is no longer PRIMARY; ECS selected ${deploymentKey(primary)}`;
  }

  return null;
}

async function logDiagnostics(
  gateway: ServiceGateway,
  snapshots: ServiceSnapshot[],
  opts: WaitForServicesOptions,
  retry: RetryOptions,
): Promise<void> {
  const log = opts.log ?? ((line: string) => process.stdout.write(`${line}\n`));

  for (const snapshot of snapshots) {
    log(`::group::ECS rollout diagnostics — ${snapshot.name}`);
    log(
      `[${snapshot.name}] desired=${snapshot.desiredCount} running=${snapshot.runningCount} pending=${snapshot.pendingCount} taskDefinition=${snapshot.taskDefinition ?? 'unknown'}`,
    );

    for (const deployment of snapshot.deployments) {
      log(
        `[${snapshot.name}] deployment=${deploymentKey(deployment)} status=${deployment.status ?? 'unknown'} rollout=${deployment.rolloutState ?? 'unknown'} desired=${deployment.desiredCount} running=${deployment.runningCount} pending=${deployment.pendingCount}${deployment.rolloutStateReason ? ` reason=${deployment.rolloutStateReason}` : ''}`,
      );
    }

    for (const event of snapshot.events.slice(0, 10)) {
      log(
        `[${snapshot.name}] event ${event.createdAt ?? 'unknown-time'}: ${event.message}`,
      );
    }

    try {
      const tasks = await withTransientRetry(
        () =>
          gateway.describeServiceTasks({
            cluster: opts.cluster,
            service: snapshot.name,
          }),
        retry,
      );
      if (tasks.length === 0) {
        log(`[${snapshot.name}] no recent tasks returned`);
      }
      for (const task of tasks) {
        log(
          `[${snapshot.name}] task=${task.taskArn} last=${task.lastStatus ?? 'unknown'} desired=${task.desiredStatus ?? 'unknown'} health=${task.healthStatus ?? 'unknown'} stopCode=${task.stopCode ?? 'none'} stoppedReason=${task.stoppedReason ?? 'none'} taskDefinition=${task.taskDefinition ?? 'unknown'}`,
        );
        for (const container of task.containers) {
          log(
            `[${snapshot.name}] container=${container.name ?? 'unknown'} last=${container.lastStatus ?? 'unknown'} exit=${container.exitCode ?? 'none'} reason=${container.reason ?? 'none'}`,
          );
        }
      }
    } catch (err) {
      log(
        `[${snapshot.name}] unable to describe recent tasks: ${errMessage(err)}`,
      );
    }
    log('::endgroup::');
  }
}

/**
 * Poll every service together and track the rollout that was PRIMARY at the
 * start. This prevents a circuit-breaker rollback from being mistaken for a
 * successful steady state on the old task definition.
 */
export async function waitForServicesStable(
  gateway: ServiceGateway,
  opts: WaitForServicesOptions,
): Promise<WaitForServicesResult> {
  const log = opts.log ?? ((line: string) => process.stdout.write(`${line}\n`));
  const doSleep = opts.sleepFn ?? ((ms: number) => sleep(ms));
  const now = opts.nowFn ?? Date.now;
  const retry: RetryOptions = {
    retries: opts.apiRetries ?? 5,
    baseDelayMs: opts.retryBaseDelayMs ?? 2000,
    sleepFn: opts.sleepFn,
  };
  const deadline = now() + opts.timeoutSeconds * 1000;
  const targetDeployments = new Map<string, string>();
  const previousStates = new Map<string, string>();

  for (;;) {
    let snapshots: ServiceSnapshot[];
    try {
      snapshots = await withTransientRetry(
        () =>
          gateway.describeServices({
            cluster: opts.cluster,
            services: opts.services,
          }),
        retry,
      );
    } catch (err) {
      return {
        code: SERVICE_EXIT.API_FAILURE,
        message: `::error::[services-stable] AWS describe-services failed after retries: ${errMessage(err)}`,
      };
    }

    for (const snapshot of snapshots) {
      if (!targetDeployments.has(snapshot.name)) {
        const primary = primaryDeployment(snapshot);
        if (!primary) {
          await logDiagnostics(gateway, snapshots, opts, retry);
          return {
            code: SERVICE_EXIT.ROLLOUT_FAILURE,
            message: `::error::[services-stable] ${snapshot.name} has no PRIMARY deployment`,
          };
        }
        targetDeployments.set(snapshot.name, deploymentKey(primary));
      }

      const target = targetDeployments.get(snapshot.name);
      if (!target) {
        continue;
      }
      const state = serviceState(snapshot, target);
      if (previousStates.get(snapshot.name) !== state) {
        log(`[${snapshot.name}] ${state}`);
        previousStates.set(snapshot.name, state);
      }

      const failure = rolloutFailure(snapshot, target);
      if (failure) {
        await logDiagnostics(gateway, snapshots, opts, retry);
        return {
          code: SERVICE_EXIT.ROLLOUT_FAILURE,
          message: `::error::[services-stable] ${snapshot.name} rollout failed: ${failure}`,
        };
      }
    }

    const allStable = snapshots.every((snapshot) => {
      const target = targetDeployments.get(snapshot.name);
      return target ? isStable(snapshot, target) : false;
    });
    if (allStable) {
      return {
        code: SERVICE_EXIT.SUCCESS,
        message: `[services-stable] all ${snapshots.length} ECS services are stable`,
      };
    }

    if (now() >= deadline) {
      await logDiagnostics(gateway, snapshots, opts, retry);
      const pending = snapshots
        .filter((snapshot) => {
          const target = targetDeployments.get(snapshot.name);
          return !target || !isStable(snapshot, target);
        })
        .map((snapshot) => snapshot.name)
        .join(', ');
      return {
        code: SERVICE_EXIT.TIMEOUT,
        message: `::error::[services-stable] timed out after ${opts.timeoutSeconds}s waiting for: ${pending}`,
      };
    }

    await doSleep(opts.pollSeconds * 1000);
  }
}

function shortArn(arn: string | undefined): string {
  if (!arn) {
    return 'unknown';
  }
  return arn.split('/').at(-1) ?? arn;
}

/** Real gateway backed by @aws-sdk/client-ecs. */
export function createServiceGateway(client: ECSClient): ServiceGateway {
  return {
    async describeServices({ cluster, services }) {
      const response = await client.send(
        new DescribeServicesCommand({ cluster, services }),
      );
      if ((response.failures?.length ?? 0) > 0) {
        const failures = response.failures
          ?.map(
            (failure) =>
              `${failure.arn ?? 'unknown'}: ${failure.reason ?? 'unknown failure'}`,
          )
          .join('; ');
        throw new Error(failures);
      }

      const found = new Map(
        (response.services ?? []).map((service) => [service.serviceName, service]),
      );
      const missing = services.filter((service) => !found.has(service));
      if (missing.length > 0) {
        throw new Error(`services not returned by ECS: ${missing.join(', ')}`);
      }

      return services.map((name) => {
        const service = found.get(name);
        if (!service) {
          throw new Error(`service not returned by ECS: ${name}`);
        }
        return {
          name,
          desiredCount: service.desiredCount ?? 0,
          runningCount: service.runningCount ?? 0,
          pendingCount: service.pendingCount ?? 0,
          taskDefinition: service.taskDefinition ?? null,
          deployments: (service.deployments ?? []).map((deployment) => ({
            id: deployment.id ?? null,
            status: deployment.status ?? null,
            rolloutState: deployment.rolloutState ?? null,
            rolloutStateReason: deployment.rolloutStateReason ?? null,
            taskDefinition: deployment.taskDefinition ?? null,
            desiredCount: deployment.desiredCount ?? 0,
            runningCount: deployment.runningCount ?? 0,
            pendingCount: deployment.pendingCount ?? 0,
          })),
          events: (service.events ?? []).slice(0, 10).map((event) => ({
            createdAt: event.createdAt?.toISOString() ?? null,
            message: event.message ?? 'unknown event',
          })),
        };
      });
    },

    async describeServiceTasks({ cluster, service }) {
      const taskArns = new Set<string>();
      for (const desiredStatus of ['RUNNING', 'PENDING', 'STOPPED'] as const) {
        const response = await client.send(
          new ListTasksCommand({
            cluster,
            serviceName: service,
            desiredStatus,
            maxResults: 10,
          }),
        );
        for (const taskArn of response.taskArns ?? []) {
          taskArns.add(taskArn);
        }
      }

      if (taskArns.size === 0) {
        return [];
      }

      const response = await client.send(
        new DescribeTasksCommand({
          cluster,
          tasks: [...taskArns],
        }),
      );
      return (response.tasks ?? []).map((task) => ({
        taskArn: shortArn(task.taskArn),
        taskDefinition: task.taskDefinitionArn ?? null,
        lastStatus: task.lastStatus ?? null,
        desiredStatus: task.desiredStatus ?? null,
        healthStatus: task.healthStatus ?? null,
        stopCode: task.stopCode ?? null,
        stoppedReason: task.stoppedReason ?? null,
        containers: (task.containers ?? []).map((container) => ({
          name: container.name ?? null,
          lastStatus: container.lastStatus ?? null,
          exitCode: container.exitCode ?? null,
          reason: container.reason ?? null,
        })),
      }));
    },
  };
}

function splitList(raw: string): string[] {
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function positiveInteger(name: string, raw: string): number {
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new UsageError(
      `${name} must be a positive integer (got '${raw}')`,
    );
  }
  return value;
}

export function parseServiceCliArgs(argv: string[]): WaitForServicesOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      cluster: { type: 'string' },
      services: { type: 'string' },
      'timeout-seconds': { type: 'string' },
      'poll-seconds': { type: 'string', default: '15' },
    },
    strict: true,
    allowPositionals: false,
  });

  const missing: string[] = [];
  const require = (name: string, value: string | undefined): string => {
    if (!value) {
      missing.push(name);
    }
    return value ?? '';
  };

  const cluster = require('--cluster', values.cluster);
  const servicesRaw = require('--services', values.services);
  const timeoutRaw = require('--timeout-seconds', values['timeout-seconds']);
  const pollRaw = values['poll-seconds'] ?? '15';
  if (missing.length > 0) {
    throw new UsageError(`missing required arguments: ${missing.join(', ')}`);
  }

  const services = splitList(servicesRaw);
  if (services.length === 0) {
    throw new UsageError('--services resolved to an empty list');
  }

  return {
    cluster,
    services,
    timeoutSeconds: positiveInteger('--timeout-seconds', timeoutRaw),
    pollSeconds: positiveInteger('--poll-seconds', pollRaw),
  };
}

export async function main(argv: string[]): Promise<ServiceExitCode> {
  let opts: WaitForServicesOptions;
  try {
    opts = parseServiceCliArgs(argv);
  } catch (err) {
    process.stderr.write(
      `::error::[ecs-wait-services-stable] ${errMessage(err)}\n`,
    );
    return SERVICE_EXIT.USAGE_ERROR;
  }

  const region = process.env.AWS_REGION;
  const client = new ECSClient(region ? { region } : {});
  const result = await waitForServicesStable(
    createServiceGateway(client),
    opts,
  );
  const sink =
    result.code === SERVICE_EXIT.SUCCESS ? process.stdout : process.stderr;
  sink.write(`${result.message}\n`);
  return result.code;
}

if (import.meta.main) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      process.stderr.write(
        `::error::[ecs-wait-services-stable] unexpected: ${err instanceof Error ? err.stack : String(err)}\n`,
      );
      process.exit(SERVICE_EXIT.API_FAILURE);
    });
}
