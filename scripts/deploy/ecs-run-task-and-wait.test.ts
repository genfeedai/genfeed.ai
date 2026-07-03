import { describe, expect, test } from 'bun:test';
import {
  type EcsGateway,
  EXIT,
  isTransientError,
  main,
  parseCliArgs,
  type RunTaskAndWaitOptions,
  runTaskAndWait,
  type TaskExit,
  UsageError,
  type WaitOutcome,
  withTransientRetry,
} from './ecs-run-task-and-wait';

const noopSleep = async (): Promise<void> => {};

interface FakeGatewayConfig {
  runTask?: () => Promise<{ taskArn: string | null }>;
  waitUntilStopped?: () => Promise<WaitOutcome>;
  describeExit?: () => Promise<TaskExit>;
  stopTask?: () => Promise<void>;
}

interface FakeGateway extends EcsGateway {
  calls: {
    runTask: number;
    waitUntilStopped: number;
    describeExit: number;
    stopTask: number;
  };
}

function makeGateway(config: FakeGatewayConfig = {}): FakeGateway {
  const calls = {
    runTask: 0,
    waitUntilStopped: 0,
    describeExit: 0,
    stopTask: 0,
  };
  return {
    calls,
    async runTask() {
      calls.runTask += 1;
      return config.runTask ? config.runTask() : { taskArn: 'arn:task/abc' };
    },
    async waitUntilStopped() {
      calls.waitUntilStopped += 1;
      return config.waitUntilStopped ? config.waitUntilStopped() : 'stopped';
    },
    async describeExit() {
      calls.describeExit += 1;
      return config.describeExit
        ? config.describeExit()
        : { exitCode: 0, stoppedReason: null, containerReason: null };
    },
    async stopTask() {
      calls.stopTask += 1;
      if (config.stopTask) {
        await config.stopTask();
      }
    },
  };
}

function baseOptions(
  overrides: Partial<RunTaskAndWaitOptions> = {},
): RunTaskAndWaitOptions {
  return {
    phase: 'migrate',
    cluster: 'genfeed-prod',
    taskDefinition: 'genfeed-prod-migrate:1',
    subnets: ['subnet-a'],
    securityGroups: ['sg-a'],
    timeoutSeconds: 900,
    stopOnTimeout: false,
    apiRetries: 3,
    retryBaseDelayMs: 1,
    sleepFn: noopSleep,
    log: () => {},
    ...overrides,
  };
}

const throttle = () => {
  const err = new Error('Rate exceeded');
  (err as { name: string }).name = 'ThrottlingException';
  (err as { $retryable?: unknown }).$retryable = { throttling: true };
  return err;
};

const nonTransient = () => {
  const err = new Error('not authorized');
  (err as { name: string }).name = 'AccessDeniedException';
  (err as { $metadata?: unknown }).$metadata = { httpStatusCode: 403 };
  return err;
};

describe('isTransientError', () => {
  test('throttling and 5xx and network codes are transient', () => {
    expect(isTransientError(throttle())).toBe(true);
    expect(isTransientError({ $metadata: { httpStatusCode: 500 } })).toBe(true);
    expect(isTransientError({ $metadata: { httpStatusCode: 429 } })).toBe(true);
    expect(isTransientError({ code: 'ECONNRESET' })).toBe(true);
    expect(isTransientError({ $retryable: {} })).toBe(true);
  });

  test('auth / validation / not-found are NOT transient', () => {
    expect(isTransientError(nonTransient())).toBe(false);
    expect(isTransientError({ name: 'ValidationException' })).toBe(false);
    expect(isTransientError({ $metadata: { httpStatusCode: 404 } })).toBe(
      false,
    );
    expect(isTransientError(null)).toBe(false);
    expect(isTransientError('boom')).toBe(false);
  });
});

describe('withTransientRetry', () => {
  test('retries transient errors then succeeds', async () => {
    let attempts = 0;
    const result = await withTransientRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) {
          throw throttle();
        }
        return 'ok';
      },
      { retries: 5, baseDelayMs: 1, sleepFn: noopSleep },
    );
    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  test('gives up after exhausting retries', async () => {
    let attempts = 0;
    await expect(
      withTransientRetry(
        async () => {
          attempts += 1;
          throw throttle();
        },
        { retries: 2, baseDelayMs: 1, sleepFn: noopSleep },
      ),
    ).rejects.toThrow('Rate exceeded');
    expect(attempts).toBe(3); // initial + 2 retries
  });

  test('does not retry non-transient errors', async () => {
    let attempts = 0;
    await expect(
      withTransientRetry(
        async () => {
          attempts += 1;
          throw nonTransient();
        },
        { retries: 5, baseDelayMs: 1, sleepFn: noopSleep },
      ),
    ).rejects.toThrow('not authorized');
    expect(attempts).toBe(1);
  });
});

describe('runTaskAndWait', () => {
  test('SUCCESS on stopped task with exit code 0', async () => {
    const gw = makeGateway();
    const result = await runTaskAndWait(gw, baseOptions());
    expect(result.code).toBe(EXIT.SUCCESS);
    expect(result.message).toContain('[migrate] task succeeded');
    expect(gw.calls.runTask).toBe(1);
    expect(gw.calls.waitUntilStopped).toBe(1);
    expect(gw.calls.describeExit).toBe(1);
    expect(gw.calls.stopTask).toBe(0);
  });

  test('TASK_FAILURE on non-zero exit code, with reasons surfaced', async () => {
    const gw = makeGateway({
      describeExit: async () => ({
        exitCode: 1,
        stoppedReason: 'Essential container exited',
        containerReason: 'OOMKilled',
      }),
    });
    const result = await runTaskAndWait(gw, baseOptions());
    expect(result.code).toBe(EXIT.TASK_FAILURE);
    expect(result.message).toContain('::error::');
    expect(result.message).toContain('exit code 1');
    expect(result.message).toContain('OOMKilled');
    expect(result.message).toContain('Essential container exited');
  });

  test('TASK_FAILURE when exit code is absent (null)', async () => {
    const gw = makeGateway({
      describeExit: async () => ({
        exitCode: null,
        stoppedReason: 'Task failed to start',
        containerReason: null,
      }),
    });
    const result = await runTaskAndWait(gw, baseOptions());
    expect(result.code).toBe(EXIT.TASK_FAILURE);
    expect(result.message).toContain('exit code unknown');
  });

  test('LAUNCH_FAILURE when run-task returns no task (null)', async () => {
    const gw = makeGateway({ runTask: async () => ({ taskArn: null }) });
    const result = await runTaskAndWait(gw, baseOptions());
    expect(result.code).toBe(EXIT.LAUNCH_FAILURE);
    expect(result.message).toContain('launched no task');
    expect(gw.calls.waitUntilStopped).toBe(0);
  });

  test('LAUNCH_FAILURE when run-task returns literal "None"', async () => {
    const gw = makeGateway({ runTask: async () => ({ taskArn: 'None' }) });
    const result = await runTaskAndWait(gw, baseOptions());
    expect(result.code).toBe(EXIT.LAUNCH_FAILURE);
  });

  test('TIMEOUT without stop-on-timeout does NOT stop the task', async () => {
    const gw = makeGateway({ waitUntilStopped: async () => 'timeout' });
    const result = await runTaskAndWait(
      gw,
      baseOptions({ stopOnTimeout: false }),
    );
    expect(result.code).toBe(EXIT.TIMEOUT);
    expect(result.message).toContain('did not stop within 900s');
    expect(gw.calls.stopTask).toBe(0);
    expect(gw.calls.describeExit).toBe(0);
  });

  test('TIMEOUT with stop-on-timeout reclaims the task', async () => {
    const gw = makeGateway({ waitUntilStopped: async () => 'timeout' });
    const result = await runTaskAndWait(
      gw,
      baseOptions({
        phase: 'boot-smoke',
        timeoutSeconds: 600,
        stopOnTimeout: true,
      }),
    );
    expect(result.code).toBe(EXIT.TIMEOUT);
    expect(result.message).toContain('[boot-smoke]');
    expect(result.message).toContain('did not stop within 600s');
    expect(gw.calls.stopTask).toBe(1);
  });

  test('TIMEOUT is still reported even if stop-task itself errors', async () => {
    const gw = makeGateway({
      waitUntilStopped: async () => 'timeout',
      stopTask: async () => {
        throw new Error('stop-task blew up');
      },
    });
    const result = await runTaskAndWait(
      gw,
      baseOptions({ stopOnTimeout: true }),
    );
    expect(result.code).toBe(EXIT.TIMEOUT);
    expect(gw.calls.stopTask).toBe(1);
  });

  test('API_FAILURE when run-task keeps throwing transient errors', async () => {
    const gw = makeGateway({
      runTask: async () => {
        throw throttle();
      },
    });
    const result = await runTaskAndWait(gw, baseOptions({ apiRetries: 2 }));
    expect(result.code).toBe(EXIT.API_FAILURE);
    expect(result.message).toContain('run-task failed after retries');
    expect(gw.calls.runTask).toBe(3); // initial + 2 retries
  });

  test('run-task recovers after transient errors then succeeds', async () => {
    let attempts = 0;
    const gw = makeGateway({
      runTask: async () => {
        attempts += 1;
        if (attempts < 2) {
          throw throttle();
        }
        return { taskArn: 'arn:task/xyz' };
      },
    });
    const result = await runTaskAndWait(gw, baseOptions());
    expect(result.code).toBe(EXIT.SUCCESS);
    expect(attempts).toBe(2);
  });

  test('API_FAILURE when the waiter throws a non-timeout error', async () => {
    const gw = makeGateway({
      waitUntilStopped: async () => {
        throw nonTransient();
      },
    });
    const result = await runTaskAndWait(gw, baseOptions());
    expect(result.code).toBe(EXIT.API_FAILURE);
    expect(result.message).toContain('wait/describe-tasks failed');
  });

  test('API_FAILURE when describe-exit keeps throwing transient errors', async () => {
    const gw = makeGateway({
      describeExit: async () => {
        throw throttle();
      },
    });
    const result = await runTaskAndWait(gw, baseOptions({ apiRetries: 1 }));
    expect(result.code).toBe(EXIT.API_FAILURE);
    expect(result.message).toContain(
      'describe-tasks (exit code) failed after retries',
    );
  });
});

describe('parseCliArgs', () => {
  const fullArgs = [
    '--phase',
    'migrate',
    '--cluster',
    'genfeed-prod',
    '--task-definition',
    'td:1',
    '--subnets',
    'subnet-a, subnet-b',
    '--security-groups',
    'sg-a',
    '--timeout-seconds',
    '900',
  ];

  test('parses required args, splits/trims lists, defaults flags', () => {
    const opts = parseCliArgs(fullArgs);
    expect(opts.phase).toBe('migrate');
    expect(opts.cluster).toBe('genfeed-prod');
    expect(opts.taskDefinition).toBe('td:1');
    expect(opts.subnets).toEqual(['subnet-a', 'subnet-b']);
    expect(opts.securityGroups).toEqual(['sg-a']);
    expect(opts.timeoutSeconds).toBe(900);
    expect(opts.stopOnTimeout).toBe(false);
    expect(opts.launchType).toBe('FARGATE');
    expect(opts.assignPublicIp).toBe('DISABLED');
  });

  test('--stop-on-timeout flag flips the default', () => {
    const opts = parseCliArgs([...fullArgs, '--stop-on-timeout']);
    expect(opts.stopOnTimeout).toBe(true);
  });

  test('throws UsageError on missing required args', () => {
    expect(() => parseCliArgs(['--phase', 'migrate'])).toThrow(UsageError);
  });

  test('throws UsageError on non-positive / non-numeric timeout', () => {
    // Use the `--flag=value` form so a leading-dash value (e.g. -5) reaches our
    // own validator rather than being rejected earlier by node's parseArgs.
    const bad = (t: string) =>
      parseCliArgs([
        '--phase',
        'x',
        '--cluster',
        'c',
        '--task-definition',
        't',
        '--subnets',
        's',
        '--security-groups',
        'g',
        `--timeout-seconds=${t}`,
      ]);
    expect(() => bad('0')).toThrow(UsageError);
    expect(() => bad('-5')).toThrow(UsageError);
    expect(() => bad('abc')).toThrow(UsageError);
  });

  test('throws UsageError when a list resolves empty', () => {
    expect(() =>
      parseCliArgs([
        '--phase',
        'x',
        '--cluster',
        'c',
        '--task-definition',
        't',
        '--subnets',
        ' , ',
        '--security-groups',
        'g',
        '--timeout-seconds',
        '10',
      ]),
    ).toThrow(UsageError);
  });
});

describe('main', () => {
  test('returns USAGE_ERROR exit code on bad args without touching AWS', async () => {
    const code = await main([]);
    expect(code).toBe(EXIT.USAGE_ERROR);
  });
});
