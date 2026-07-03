#!/usr/bin/env bun
/**
 * ECS one-off task runner + waiter for the production deploy pipeline.
 *
 * Replaces the four hand-rolled `aws ecs describe-tasks` polling loops that used
 * to live inline in .github/workflows/_deploy-ecs-core.yml (migrate, workflow
 * backfill, boot-smoke, credential backfill). Each of those sites ran a one-off
 * FARGATE task and polled describe-tasks on a ~6s cadence until STOPPED, then
 * read containers[0].exitCode. This module does the same thing with the AWS
 * SDK's native `waitUntilTasksStopped` waiter (configurable max-wait, built-in
 * 6s poll cadence + throttling backoff) plus a single, unit-tested classification
 * of the terminal state into a documented exit-code enumeration.
 *
 * EXIT CODES — stable contract; the workflow log and humans key off these:
 *   0  SUCCESS         task reached STOPPED with container exit code 0
 *   1  TASK_FAILURE    task reached STOPPED with a non-zero / absent exit code
 *   2  TIMEOUT         task never reached STOPPED within --timeout-seconds
 *   3  API_FAILURE     AWS API / infra error (throttling exhausted, auth, network)
 *   4  LAUNCH_FAILURE  run-task started no task (capacity / IAM / quota)
 *   5  USAGE_ERROR     invalid or missing CLI arguments
 *
 * Every failure exits non-zero, so the calling workflow step fails exactly as it
 * did before this refactor. Distinguishing WHICH non-zero (task vs timeout vs API
 * vs launch) is the added legibility — the deploy pass/fail outcome is unchanged.
 *
 * Local usage (needs AWS creds with the same ECS perms the deploy role has):
 *   bun scripts/deploy/ecs-run-task-and-wait.ts \
 *     --phase migrate --cluster "$CLUSTER" --task-definition "$TD" \
 *     --subnets "$SUBNETS" --security-groups "$SG" --timeout-seconds 900
 */

import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import {
  DescribeTasksCommand,
  ECSClient,
  RunTaskCommand,
  StopTaskCommand,
  waitUntilTasksStopped,
} from '@aws-sdk/client-ecs';

// On timeout the smithy waiter throws a plain Error whose `name` is set to
// "TimeoutError" (see checkExceptions in @smithy/core util-waiter); the
// WaiterState only exists JSON-stringified inside `message`, never as an own
// property on the error. Match on `name`, which is the stable contract.
const WAITER_TIMEOUT_ERROR_NAME = 'TimeoutError';

/** True when the error is the smithy waiter's max-wait-time expiry. */
export function isWaiterTimeoutError(err: unknown): boolean {
  return err instanceof Error && err.name === WAITER_TIMEOUT_ERROR_NAME;
}

export const EXIT = {
  SUCCESS: 0,
  TASK_FAILURE: 1,
  TIMEOUT: 2,
  API_FAILURE: 3,
  LAUNCH_FAILURE: 4,
  USAGE_ERROR: 5,
} as const;
export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

export type WaitOutcome = 'stopped' | 'timeout';

export interface RunTaskParams {
  cluster: string;
  taskDefinition: string;
  subnets: string[];
  securityGroups: string[];
  launchType: string;
  assignPublicIp: string;
}

export interface TaskExit {
  exitCode: number | null;
  stoppedReason: string | null;
  containerReason: string | null;
}

/**
 * Thin AWS boundary. The real implementation (createAwsGateway) wraps
 * @aws-sdk/client-ecs; tests supply a fake so no live AWS calls happen. All
 * classification and retry/backoff logic lives in runTaskAndWait, NOT here, so
 * that logic is exercised by the unit suite against a fake gateway.
 */
export interface EcsGateway {
  runTask(params: RunTaskParams): Promise<{ taskArn: string | null }>;
  waitUntilStopped(args: {
    cluster: string;
    taskArn: string;
    maxWaitTimeSeconds: number;
  }): Promise<WaitOutcome>;
  describeExit(args: { cluster: string; taskArn: string }): Promise<TaskExit>;
  stopTask(args: {
    cluster: string;
    taskArn: string;
    reason: string;
  }): Promise<void>;
}

// AWS/service error names that are safe to retry — throttling, transient
// service faults, and request timeouts. Anything not in here (auth, validation,
// not-found) is a hard failure: retrying only delays a certain failure.
const TRANSIENT_ERROR_NAMES = new Set<string>([
  'ThrottlingException',
  'Throttling',
  'ThrottledException',
  'TooManyRequestsException',
  'RequestLimitExceeded',
  'RequestThrottled',
  'ProvisionedThroughputExceededException',
  'ServiceUnavailable',
  'ServiceUnavailableException',
  'InternalServerError',
  'InternalError',
  'InternalFailure',
  'ServerException',
  'RequestTimeout',
  'RequestTimeoutException',
  'TimeoutError',
]);

// Node socket-level error codes for transient network blips.
const TRANSIENT_NETWORK_CODES = new Set<string>([
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EPIPE',
]);

export function isTransientError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const e = err as {
    name?: string;
    code?: string;
    $retryable?: unknown;
    $metadata?: { httpStatusCode?: number };
  };
  // The AWS SDK tags retryable service faults with $retryable.
  if (e.$retryable) {
    return true;
  }
  if (e.name && TRANSIENT_ERROR_NAMES.has(e.name)) {
    return true;
  }
  if (e.code && TRANSIENT_NETWORK_CODES.has(e.code)) {
    return true;
  }
  const status = e.$metadata?.httpStatusCode;
  if (typeof status === 'number' && (status === 429 || status >= 500)) {
    return true;
  }
  return false;
}

export interface RetryOptions {
  retries: number;
  baseDelayMs: number;
  sleepFn?: (ms: number) => Promise<void>;
}

/**
 * Retry only transient AWS errors, with exponential backoff. Non-transient
 * errors throw immediately.
 */
export async function withTransientRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions,
): Promise<T> {
  const doSleep = opts.sleepFn ?? ((ms: number) => sleep(ms));
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      attempt += 1;
      if (attempt > opts.retries || !isTransientError(err)) {
        throw err;
      }
      const delay = opts.baseDelayMs * 2 ** (attempt - 1);
      await doSleep(delay);
    }
  }
}

export interface RunTaskAndWaitOptions {
  phase: string;
  cluster: string;
  taskDefinition: string;
  subnets: string[];
  securityGroups: string[];
  timeoutSeconds: number;
  stopOnTimeout: boolean;
  launchType?: string;
  assignPublicIp?: string;
  apiRetries?: number;
  retryBaseDelayMs?: number;
  sleepFn?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
}

export interface RunTaskAndWaitResult {
  code: ExitCode;
  message: string;
}

function errMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

/**
 * Launch a one-off ECS task, wait for it to STOP, and classify the outcome into
 * a typed exit code. Pure orchestration over the injected gateway — no direct
 * AWS SDK use — so the whole decision tree is unit-testable.
 */
export async function runTaskAndWait(
  gateway: EcsGateway,
  opts: RunTaskAndWaitOptions,
): Promise<RunTaskAndWaitResult> {
  const log = opts.log ?? ((line: string) => process.stdout.write(`${line}\n`));
  const retry: RetryOptions = {
    retries: opts.apiRetries ?? 5,
    baseDelayMs: opts.retryBaseDelayMs ?? 2000,
    sleepFn: opts.sleepFn,
  };
  const tag = `[${opts.phase}]`;

  // 1. Launch the one-off task (retry transient run-task faults).
  let taskArn: string | null;
  try {
    const started = await withTransientRetry(
      () =>
        gateway.runTask({
          cluster: opts.cluster,
          taskDefinition: opts.taskDefinition,
          subnets: opts.subnets,
          securityGroups: opts.securityGroups,
          launchType: opts.launchType ?? 'FARGATE',
          assignPublicIp: opts.assignPublicIp ?? 'DISABLED',
        }),
      retry,
    );
    taskArn = started.taskArn;
  } catch (err) {
    return {
      code: EXIT.API_FAILURE,
      message: `::error::${tag} AWS run-task failed after retries: ${errMessage(err)}`,
    };
  }

  // run-task can return HTTP 200 with an empty tasks[] array on capacity / IAM /
  // quota failure. The old bash guarded on the literal "None" that the CLI
  // prints for that case; here it surfaces as a null (or "None") taskArn.
  if (!taskArn || taskArn === 'None') {
    return {
      code: EXIT.LAUNCH_FAILURE,
      message: `::error::${tag} ECS run-task launched no task (capacity, IAM, or quota failure)`,
    };
  }
  log(
    `${tag} launched task ${taskArn}; waiting up to ${opts.timeoutSeconds}s for STOPPED...`,
  );

  // 2. Wait for STOPPED via the AWS-native waiter (6s poll + built-in backoff).
  let outcome: WaitOutcome;
  try {
    outcome = await gateway.waitUntilStopped({
      cluster: opts.cluster,
      taskArn,
      maxWaitTimeSeconds: opts.timeoutSeconds,
    });
  } catch (err) {
    return {
      code: EXIT.API_FAILURE,
      message: `::error::${tag} AWS wait/describe-tasks failed: ${errMessage(err)}`,
    };
  }

  if (outcome === 'timeout') {
    if (opts.stopOnTimeout) {
      // Best-effort reclaim of the runaway task. A stop-task error must never
      // mask the timeout we are actually reporting.
      try {
        await gateway.stopTask({
          cluster: opts.cluster,
          taskArn,
          reason: `deploy ${opts.phase} timed out before rollout`,
        });
      } catch {
        // swallow — the timeout is the real signal
      }
    }
    return {
      code: EXIT.TIMEOUT,
      message: `::error::${tag} task did not stop within ${opts.timeoutSeconds}s (timed out waiting for STOPPED)`,
    };
  }

  // 3. Task stopped — read the container exit code (retry transient describe).
  let exit: TaskExit;
  try {
    exit = await withTransientRetry(
      () => gateway.describeExit({ cluster: opts.cluster, taskArn }),
      retry,
    );
  } catch (err) {
    return {
      code: EXIT.API_FAILURE,
      message: `::error::${tag} AWS describe-tasks (exit code) failed after retries: ${errMessage(err)}`,
    };
  }

  if (exit.exitCode === 0) {
    return {
      code: EXIT.SUCCESS,
      message: `${tag} task succeeded (exit code 0)`,
    };
  }

  const detail = [
    `exit code ${exit.exitCode ?? 'unknown'}`,
    exit.stoppedReason ? `stoppedReason: ${exit.stoppedReason}` : null,
    exit.containerReason ? `containerReason: ${exit.containerReason}` : null,
  ]
    .filter(Boolean)
    .join('; ');
  return {
    code: EXIT.TASK_FAILURE,
    message: `::error::${tag} task failed (${detail})`,
  };
}

/** Real gateway backed by @aws-sdk/client-ecs. */
export function createAwsGateway(client: ECSClient): EcsGateway {
  return {
    async runTask(params) {
      const res = await client.send(
        new RunTaskCommand({
          cluster: params.cluster,
          taskDefinition: params.taskDefinition,
          launchType: params.launchType as never,
          networkConfiguration: {
            awsvpcConfiguration: {
              subnets: params.subnets,
              securityGroups: params.securityGroups,
              assignPublicIp: params.assignPublicIp as never,
            },
          },
        }),
      );
      return { taskArn: res.tasks?.[0]?.taskArn ?? null };
    },

    async waitUntilStopped({ cluster, taskArn, maxWaitTimeSeconds }) {
      try {
        await waitUntilTasksStopped(
          { client, maxWaitTime: maxWaitTimeSeconds },
          { cluster, tasks: [taskArn] },
        );
        return 'stopped';
      } catch (err) {
        // The convenience waiter throws on any non-SUCCESS terminal state. A
        // TimeoutError means maxWaitTime elapsed without STOPPED; anything else
        // is a genuine API/infra error and must propagate to API_FAILURE.
        if (isWaiterTimeoutError(err)) {
          return 'timeout';
        }
        throw err;
      }
    },

    async describeExit({ cluster, taskArn }) {
      const res = await client.send(
        new DescribeTasksCommand({ cluster, tasks: [taskArn] }),
      );
      const task = res.tasks?.[0];
      const container = task?.containers?.[0];
      return {
        exitCode: container?.exitCode ?? null,
        stoppedReason: task?.stoppedReason ?? null,
        containerReason: container?.reason ?? null,
      };
    },

    async stopTask({ cluster, taskArn, reason }) {
      await client.send(
        new StopTaskCommand({ cluster, task: taskArn, reason }),
      );
    },
  };
}

export class UsageError extends Error {}

function splitList(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function parseCliArgs(argv: string[]): RunTaskAndWaitOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      phase: { type: 'string' },
      cluster: { type: 'string' },
      'task-definition': { type: 'string' },
      subnets: { type: 'string' },
      'security-groups': { type: 'string' },
      'timeout-seconds': { type: 'string' },
      'stop-on-timeout': { type: 'boolean', default: false },
      'launch-type': { type: 'string', default: 'FARGATE' },
      'assign-public-ip': { type: 'string', default: 'DISABLED' },
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

  const phase = require('--phase', values.phase);
  const cluster = require('--cluster', values.cluster);
  const taskDefinition = require('--task-definition', values[
    'task-definition'
  ]);
  const subnetsRaw = require('--subnets', values.subnets);
  const securityGroupsRaw = require('--security-groups', values[
    'security-groups'
  ]);
  const timeoutRaw = require('--timeout-seconds', values['timeout-seconds']);

  if (missing.length > 0) {
    throw new UsageError(`missing required arguments: ${missing.join(', ')}`);
  }

  const subnets = splitList(subnetsRaw);
  const securityGroups = splitList(securityGroupsRaw);
  if (subnets.length === 0) {
    throw new UsageError('--subnets resolved to an empty list');
  }
  if (securityGroups.length === 0) {
    throw new UsageError('--security-groups resolved to an empty list');
  }

  const timeoutSeconds = Number.parseInt(timeoutRaw, 10);
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds <= 0) {
    throw new UsageError(
      `--timeout-seconds must be a positive integer (got '${timeoutRaw}')`,
    );
  }

  return {
    phase,
    cluster,
    taskDefinition,
    subnets,
    securityGroups,
    timeoutSeconds,
    stopOnTimeout: values['stop-on-timeout'] ?? false,
    launchType: values['launch-type'] ?? 'FARGATE',
    assignPublicIp: values['assign-public-ip'] ?? 'DISABLED',
  };
}

export async function main(argv: string[]): Promise<ExitCode> {
  let opts: RunTaskAndWaitOptions;
  try {
    opts = parseCliArgs(argv);
  } catch (err) {
    process.stderr.write(
      `::error::[ecs-run-task-and-wait] ${errMessage(err)}\n`,
    );
    return EXIT.USAGE_ERROR;
  }

  // Region comes from AWS_REGION in the environment (the deploy workflow already
  // exports it); the SDK reads it automatically, but pass it explicitly when set
  // so a misconfigured runner fails loudly rather than defaulting silently.
  const region = process.env.AWS_REGION;
  const client = new ECSClient(region ? { region } : {});
  const gateway = createAwsGateway(client);

  const result = await runTaskAndWait(gateway, opts);
  const sink = result.code === EXIT.SUCCESS ? process.stdout : process.stderr;
  sink.write(`${result.message}\n`);
  return result.code;
}

if (import.meta.main) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      process.stderr.write(
        `::error::[ecs-run-task-and-wait] unexpected: ${err instanceof Error ? err.stack : String(err)}\n`,
      );
      process.exit(EXIT.API_FAILURE);
    });
}
