import { describe, expect, test } from 'bun:test';
import {
  parseServiceCliArgs,
  SERVICE_EXIT,
  type ServiceGateway,
  type ServiceSnapshot,
  type TaskDiagnostic,
  waitForServicesStable,
} from './ecs-wait-services-stable';

function deployment(
  overrides: Partial<ServiceSnapshot['deployments'][number]> = {},
): ServiceSnapshot['deployments'][number] {
  return {
    id: 'ecs-svc/new',
    status: 'PRIMARY',
    rolloutState: 'IN_PROGRESS',
    rolloutStateReason: null,
    taskDefinition: 'workers:2',
    desiredCount: 1,
    runningCount: 0,
    pendingCount: 1,
    ...overrides,
  };
}

function snapshot(overrides: Partial<ServiceSnapshot> = {}): ServiceSnapshot {
  return {
    name: 'workers',
    desiredCount: 1,
    runningCount: 0,
    pendingCount: 1,
    taskDefinition: 'workers:2',
    deployments: [deployment()],
    events: [],
    ...overrides,
  };
}

interface FakeGateway extends ServiceGateway {
  calls: {
    describeServices: number;
    describeServiceTasks: number;
  };
}

function makeGateway(
  snapshots: ServiceSnapshot[][],
  tasks: TaskDiagnostic[] = [],
): FakeGateway {
  const calls = {
    describeServices: 0,
    describeServiceTasks: 0,
  };
  return {
    calls,
    async describeServices() {
      const index = Math.min(calls.describeServices, snapshots.length - 1);
      calls.describeServices += 1;
      return snapshots[index] ?? [];
    },
    async describeServiceTasks() {
      calls.describeServiceTasks += 1;
      return tasks;
    },
  };
}

function stableSnapshot(name = 'workers'): ServiceSnapshot {
  return snapshot({
    name,
    runningCount: 1,
    pendingCount: 0,
    deployments: [
      deployment({
        rolloutState: 'COMPLETED',
        runningCount: 1,
        pendingCount: 0,
      }),
    ],
  });
}

describe('waitForServicesStable', () => {
  test('succeeds immediately when every target deployment is stable', async () => {
    const gateway = makeGateway([
      [stableSnapshot('api'), stableSnapshot('workers')],
    ]);
    const result = await waitForServicesStable(gateway, {
      cluster: 'genfeed-production',
      services: ['api', 'workers'],
      timeoutSeconds: 1200,
      pollSeconds: 15,
      log: () => {},
    });

    expect(result.code).toBe(SERVICE_EXIT.SUCCESS);
    expect(result.message).toContain('all 2 ECS services are stable');
    expect(gateway.calls.describeServices).toBe(1);
  });

  test('polls all services together until they stabilize', async () => {
    let now = 0;
    const gateway = makeGateway([[snapshot()], [stableSnapshot()]]);
    const result = await waitForServicesStable(gateway, {
      cluster: 'genfeed-production',
      services: ['workers'],
      timeoutSeconds: 1200,
      pollSeconds: 15,
      nowFn: () => now,
      sleepFn: async (ms) => {
        now += ms;
      },
      log: () => {},
    });

    expect(result.code).toBe(SERVICE_EXIT.SUCCESS);
    expect(gateway.calls.describeServices).toBe(2);
  });

  test('fails fast when ECS circuit breaker rolls back the target deployment', async () => {
    const logs: string[] = [];
    const failedTarget = deployment({
      status: 'ACTIVE',
      rolloutState: 'FAILED',
      rolloutStateReason: 'tasks failed to start',
      runningCount: 0,
      pendingCount: 0,
    });
    const rollback = deployment({
      id: 'ecs-svc/old',
      status: 'PRIMARY',
      rolloutState: 'COMPLETED',
      taskDefinition: 'workers:1',
      runningCount: 1,
      pendingCount: 0,
    });
    const gateway = makeGateway(
      [
        [snapshot()],
        [
          snapshot({
            runningCount: 1,
            pendingCount: 0,
            taskDefinition: 'workers:1',
            deployments: [rollback, failedTarget],
            events: [
              {
                createdAt: '2026-07-16T04:30:00.000Z',
                message: 'deployment failed',
              },
            ],
          }),
        ],
      ],
      [
        {
          taskArn: 'task-123',
          taskDefinition: 'workers:2',
          lastStatus: 'STOPPED',
          desiredStatus: 'STOPPED',
          healthStatus: 'UNHEALTHY',
          stopCode: 'EssentialContainerExited',
          stoppedReason: 'Essential container in task exited',
          containers: [
            {
              name: 'workers',
              lastStatus: 'STOPPED',
              exitCode: 1,
              reason: 'Container health check failed',
            },
          ],
        },
      ],
    );

    const result = await waitForServicesStable(gateway, {
      cluster: 'genfeed-production',
      services: ['workers'],
      timeoutSeconds: 1200,
      pollSeconds: 15,
      sleepFn: async () => {},
      log: (line) => logs.push(line),
    });

    expect(result.code).toBe(SERVICE_EXIT.ROLLOUT_FAILURE);
    expect(result.message).toContain('tasks failed to start');
    expect(logs.join('\n')).toContain('EssentialContainerExited');
    expect(logs.join('\n')).toContain('Container health check failed');
  });

  test('times out with diagnostics for services that remain unstable', async () => {
    let now = 0;
    const logs: string[] = [];
    const gateway = makeGateway([[snapshot()]]);
    const result = await waitForServicesStable(gateway, {
      cluster: 'genfeed-production',
      services: ['workers'],
      timeoutSeconds: 30,
      pollSeconds: 15,
      nowFn: () => now,
      sleepFn: async (ms) => {
        now += ms;
      },
      log: (line) => logs.push(line),
    });

    expect(result.code).toBe(SERVICE_EXIT.TIMEOUT);
    expect(result.message).toContain('waiting for: workers');
    expect(gateway.calls.describeServiceTasks).toBe(1);
    expect(logs.join('\n')).toContain('ECS rollout diagnostics — workers');
  });

  test('returns API_FAILURE when describe-services cannot be read', async () => {
    const gateway: ServiceGateway = {
      async describeServices() {
        const error = new Error('not authorized');
        error.name = 'AccessDeniedException';
        throw error;
      },
      async describeServiceTasks() {
        return [];
      },
    };
    const result = await waitForServicesStable(gateway, {
      cluster: 'genfeed-production',
      services: ['workers'],
      timeoutSeconds: 30,
      pollSeconds: 15,
      log: () => {},
    });

    expect(result.code).toBe(SERVICE_EXIT.API_FAILURE);
    expect(result.message).toContain('not authorized');
  });
});

describe('parseServiceCliArgs', () => {
  test('parses and trims the service list', () => {
    expect(
      parseServiceCliArgs([
        '--cluster',
        'genfeed-production',
        '--services',
        'api, workers',
        '--timeout-seconds',
        '1200',
      ]),
    ).toMatchObject({
      cluster: 'genfeed-production',
      services: ['api', 'workers'],
      timeoutSeconds: 1200,
      pollSeconds: 15,
    });
  });

  test('rejects missing or invalid arguments', () => {
    expect(() => parseServiceCliArgs([])).toThrow();
    expect(() =>
      parseServiceCliArgs([
        '--cluster',
        'c',
        '--services',
        ' , ',
        '--timeout-seconds',
        '10',
      ]),
    ).toThrow();
    expect(() =>
      parseServiceCliArgs([
        '--cluster',
        'c',
        '--services',
        'workers',
        '--timeout-seconds=0',
      ]),
    ).toThrow();
    expect(() =>
      parseServiceCliArgs([
        '--cluster',
        'c',
        '--services',
        'workers',
        '--timeout-seconds',
        '10',
        '--poll-seconds=abc',
      ]),
    ).toThrow();
  });
});
