import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AgentRunsController } from '@api/collections/agent-runs/controllers/agent-runs.controller';
import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import { RunsController } from '@api/collections/runs/controllers/runs.controller';
import { RunsService } from '@api/collections/runs/services/runs.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * Route-ownership contract for the two controllers that used to collide.
 *
 * `AgentRunsController` (model `AgentRun`) and `RunsController` (model `Run`)
 * both mounted `@Controller('runs')`, and `AppModule` registers
 * `AgentRunsModule` before `RunsModule`. Express matches the first-registered
 * route, so `POST /runs`, `GET /runs`, `GET /runs/:id` and `PATCH /runs/:id`
 * all resolved to `AgentRunsController` — callers of the generic Run API
 * silently received `AgentRun` records. `RunsController` now owns
 * `action-runs`.
 *
 * The sibling unit specs instantiate each controller directly, so they cannot
 * see a mount-path collision at all. These tests read the route table off the
 * running Express instance instead, which is the only place the conflict is
 * observable.
 */

/** One registered route, as Express sees it. */
type RegisteredRoute = { method: string; path: string };

type ExpressLayer = {
  route?: {
    methods: Record<string, boolean>;
    path: string | string[];
  };
};

type ExpressRouter = { stack: ExpressLayer[] };

/**
 * Express 5 exposes the router as `app.router`; Express 4 used the lazily
 * built `app._router`. Read whichever is present so the assertion survives the
 * next platform bump rather than silently reporting zero routes.
 */
function readRegisteredRoutes(app: INestApplication): RegisteredRoute[] {
  const instance = app.getHttpAdapter().getInstance() as {
    _router?: ExpressRouter;
    router?: ExpressRouter;
  };

  const router = instance.router ?? instance._router;

  if (!router?.stack) {
    throw new Error(
      'Could not read the Express route table — the adapter shape changed.',
    );
  }

  const routes: RegisteredRoute[] = [];

  for (const layer of router.stack) {
    if (!layer.route) {
      continue;
    }

    const paths = Array.isArray(layer.route.path)
      ? layer.route.path
      : [layer.route.path];

    for (const path of paths) {
      for (const [method, enabled] of Object.entries(layer.route.methods)) {
        if (enabled) {
          routes.push({ method: method.toUpperCase(), path });
        }
      }
    }
  }

  return routes;
}

describe('Runs route ownership (registered route table)', () => {
  const orgId = '507f191e810c19729de860ee';
  const userId = '507f191e810c19729de860ef';

  let app: INestApplication;
  let agentRunsService: Record<string, ReturnType<typeof vi.fn>>;
  let runsService: Record<string, ReturnType<typeof vi.fn>>;

  beforeAll(async () => {
    agentRunsService = {
      create: vi.fn().mockResolvedValue({ id: 'agent-run-1' }),
      findAll: vi.fn().mockResolvedValue({ docs: [] }),
      findOne: vi.fn().mockResolvedValue({ id: 'agent-run-1' }),
      getActiveRuns: vi.fn().mockResolvedValue([]),
      getBatchWithContent: vi.fn().mockResolvedValue([]),
      getRunContent: vi.fn().mockResolvedValue({}),
      getStats: vi.fn().mockResolvedValue({}),
      patch: vi.fn().mockResolvedValue({ id: 'agent-run-1' }),
      remove: vi.fn().mockResolvedValue({ id: 'agent-run-1' }),
    };

    runsService = {
      appendEventForRun: vi.fn().mockResolvedValue({ _id: 'run-1' }),
      cancelRun: vi.fn().mockResolvedValue({ _id: 'run-1' }),
      createRun: vi
        .fn()
        .mockResolvedValue({ reused: false, run: { _id: 'run-1' } }),
      executeRun: vi.fn().mockResolvedValue({ _id: 'run-1' }),
      getRun: vi.fn().mockResolvedValue({ _id: 'run-1' }),
      getRunEvents: vi.fn().mockResolvedValue([]),
      listRuns: vi
        .fn()
        .mockResolvedValue({ items: [], limit: 20, offset: 0, total: 0 }),
      updateRun: vi.fn().mockResolvedValue({ _id: 'run-1' }),
    };

    const moduleRef = await Test.createTestingModule({
      // Declaration order mirrors AppModule: AgentRunsModule is registered
      // before RunsModule, so AgentRunsController wins any shared path.
      controllers: [AgentRunsController, RunsController],
      providers: [
        { provide: AgentRunsService, useValue: agentRunsService },
        { provide: RunsService, useValue: runsService },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();

    // `@CurrentUser()` reads `request.user`; the global auth guard that
    // normally populates it is not part of a routing contract.
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { user: User }).user = {
        id: userId,
        organizationId: orgId,
        userId: userId,
      } as unknown as User;
      next();
    });

    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    for (const spy of Object.values(agentRunsService)) {
      spy.mockClear();
    }
    for (const spy of Object.values(runsService)) {
      spy.mockClear();
    }
  });

  it('registers no path+method twice across the two controllers', () => {
    const routes = readRegisteredRoutes(app);

    expect(routes.length).toBeGreaterThan(0);

    const seen = new Map<string, number>();

    for (const route of routes) {
      const key = `${route.method} ${route.path}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }

    const duplicates = [...seen.entries()]
      .filter(([, count]) => count > 1)
      .map(([key]) => key);

    expect(duplicates).toEqual([]);
  });

  it('mounts the generic Run ledger under /action-runs, never /runs', () => {
    const paths = readRegisteredRoutes(app).map((route) => route.path);

    // Paths unique to RunsController — they must all live under action-runs.
    expect(paths).toContain('/action-runs');
    expect(paths).toContain('/action-runs/:runId/execute');
    expect(paths).toContain('/action-runs/:runId/events');

    expect(paths).not.toContain('/runs/:runId/execute');
    expect(paths).not.toContain('/runs/:runId/events');
  });

  it.each([
    ['get', '/runs'],
    ['post', '/runs'],
  ] as const)(
    '%s %s reaches AgentRunsController, not the Run ledger',
    async (method, path) => {
      await request(app.getHttpServer())[method](path);

      expect(runsService.listRuns).not.toHaveBeenCalled();
      expect(runsService.createRun).not.toHaveBeenCalled();
    },
  );

  it('GET /action-runs reaches the Run ledger', async () => {
    await request(app.getHttpServer()).get('/action-runs');

    expect(runsService.listRuns).toHaveBeenCalledTimes(1);
    expect(agentRunsService.findAll).not.toHaveBeenCalled();
  });

  it('POST /action-runs reaches the Run ledger', async () => {
    await request(app.getHttpServer())
      .post('/action-runs')
      .send({ actionType: 'generate', input: {}, surface: 'ide' });

    expect(runsService.createRun).toHaveBeenCalledTimes(1);
    expect(agentRunsService.create).not.toHaveBeenCalled();
  });

  it('GET /action-runs/:runId reaches the Run ledger', async () => {
    await request(app.getHttpServer()).get('/action-runs/run-1');

    expect(runsService.getRun).toHaveBeenCalledTimes(1);
    expect(agentRunsService.findOne).not.toHaveBeenCalled();
  });
});

/**
 * Demonstrates the mechanism itself, so the regression stays legible even if
 * both real controllers are refactored away. Two controllers on one prefix
 * produce two entries for the same path+method, and Express serves the first.
 */
describe('Express route resolution on a shared prefix', () => {
  @Controller('collision-fixture')
  class FirstFixtureController {
    @Get()
    findAll(): { owner: string } {
      return { owner: 'first' };
    }
  }

  @Controller('collision-fixture')
  class SecondFixtureController {
    @Get()
    findAll(): { owner: string } {
      return { owner: 'second' };
    }
  }

  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [FirstFixtureController, SecondFixtureController],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('registers the duplicate path twice and serves the first registration', async () => {
    const collisions = readRegisteredRoutes(app).filter(
      (route) => route.path === '/collision-fixture' && route.method === 'GET',
    );

    expect(collisions).toHaveLength(2);

    const response = await request(app.getHttpServer()).get(
      '/collision-fixture',
    );

    expect(response.body).toEqual({ owner: 'first' });
  });
});
