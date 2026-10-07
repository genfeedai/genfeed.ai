import type { IncomingMessage } from 'node:http';
import { request as nativeRequest } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { CloudTenantObserver } from '@api/helpers/cloud-tenant-diagnostics/cloud-tenant-diagnostics';
import {
  CLOUD_TENANT_OBSERVER,
  getCloudTenantObserver,
  observeCloudTenant,
} from '@api/helpers/cloud-tenant-diagnostics/cloud-tenant-diagnostics';
import { RequestTimeout } from '@api/helpers/decorators/request-timeout/request-timeout.decorator';
import { PerformanceInterceptor } from '@api/helpers/interceptors/performance/performance.interceptor';
import { TimeoutInterceptor } from '@api/interceptors/timeout.interceptor';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import type {
  CallHandler,
  CanActivate,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common';
import { BadRequestException, Controller, Get, Module } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { concat, NEVER, of } from 'rxjs';

let handlerCalls = 0;
let guardRelease: (() => void) | undefined;
let guardMode = '';
@Controller()
class MiniController {
  @Get('success') success() {
    handlerCalls++;
    return { ok: true };
  }
  @Get('typed') typed() {
    handlerCalls++;
    throw new BadRequestException('synthetic');
  }
  @Get('timeout') @RequestTimeout(20) timeout() {
    handlerCalls++;
    return NEVER;
  }
  @Get('pending') @RequestTimeout(40) pending() {
    handlerCalls++;
    return NEVER;
  }
  @Get('before') before() {
    handlerCalls++;
    return { ok: true };
  }
  @Get('deferred') deferred() {
    handlerCalls++;
    return { ok: true };
  }
  @Get('multi') multi() {
    handlerCalls++;
    return of('first', 'second');
  }
  @Get('repeat') repeat() {
    handlerCalls++;
    return { ok: true };
  }
}
@Module({ controllers: [MiniController] })
class MiniModule {}
class DeferredGuard implements CanActivate {
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<IncomingMessage>();
    if (request.url === `/${guardMode}`)
      await new Promise<void>((resolve) => {
        guardRelease = resolve;
      });
    return true;
  }
}
class RepeatBoundary implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    return context.switchToHttp().getRequest<IncomingMessage>().url ===
      '/repeat'
      ? concat(next.handle(), next.handle())
      : next.handle();
  }
}

describe('real miniature Nest request lifecycle', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    Reflect.deleteProperty(globalThis, CLOUD_TENANT_OBSERVER);
    guardMode = '';
    guardRelease = undefined;
  });
  it('off/on preserve real handler counts, server408, guarded boundary, emissions and native aborts', async () => {
    const { createApiObserver } = await import(
      pathToFileURL(
        resolve(
          process.cwd(),
          '../../../scripts/ci/cloud-tenant-guard-sweep/api-observer-core.mjs',
        ),
      ).href
    );
    const { joinCausalEvidence } = await import(
      pathToFileURL(
        resolve(
          process.cwd(),
          '../../../scripts/ci/cloud-tenant-guard-sweep/causal-evidence.mjs',
        ),
      ).href
    );
    for (const enabled of [false, true]) {
      handlerCalls = 0;
      const events: Record<string, unknown>[] = [];
      const instance = createApiObserver({
        write: (line: string) => events.push(JSON.parse(line)),
        pool: { end: () => Promise.resolve() },
        setIntervalImpl: () => ({ unref() {} }),
        clearIntervalImpl: () => {},
        cpuUsage: () => ({ user: 0, system: 0 }),
        hrtime: () => 0n,
      });
      Reflect.set(
        globalThis,
        CLOUD_TENANT_OBSERVER,
        instance.observer as CloudTenantObserver,
      );
      for (const [key, value] of Object.entries({
        CLOUD_SWEEP_DIAGNOSTICS: enabled ? '1' : '0',
        CI: 'true',
        GITHUB_ACTIONS: 'true',
        GENFEED_CLOUD: 'true',
        NODE_ENV: 'test',
      }))
        vi.stubEnv(key, value);
      vi.stubEnv('CLOUD_SWEEP_LOCAL', undefined);
      const app = await NestFactory.create(MiniModule, { logger: false });
      const observer = getCloudTenantObserver();
      app.use(
        (
          req: IncomingMessage,
          res: Parameters<CloudTenantObserver['ingress']>[1],
          next: () => void,
        ) => {
          observeCloudTenant(observer, (value) => value.ingress(req, res));
          next();
        },
      );
      app.useGlobalGuards(new DeferredGuard());
      const logger = {
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      } as unknown as LoggerService;
      const config = {
        get: (key: string) => (key === 'NODE_ENV' ? 'test' : undefined),
      } as unknown as ConfigService;
      app.useGlobalInterceptors(
        new TimeoutInterceptor(new Reflector()),
        new RepeatBoundary(),
        new PerformanceInterceptor(logger, config),
      );
      await app.listen(0, '127.0.0.1');
      const server = app.getHttpServer();
      const port = server.address().port as number;
      const clients: Record<string, unknown>[] = [];
      let sequence = 0;
      const send = (path: string, abortBoundary?: 'before' | 'after') =>
        new Promise<{ status: number | null; body: string }>(
          (resolveResponse) => {
            const callsBefore = handlerCalls;
            const current = ++sequence,
              sent = Date.now();
            let headers: number | null = null;
            const request = nativeRequest(
              {
                host: '127.0.0.1',
                port,
                path,
                headers: { 'x-genfeed-ci-attempt': String(current) },
              },
              (response) => {
                headers = Date.now();
                let body = '';
                response.on('data', (chunk) => {
                  body += String(chunk);
                });
                response.on('end', () => {
                  clients.push({
                    sequence: current,
                    sentAtEpochMs: sent,
                    headerAtEpochMs: headers,
                    endedAtEpochMs: Date.now(),
                    route: '/v1/case',
                    actor: 'M:A',
                    sweepPhase: 'memberAGets',
                    method: 'GET',
                  });
                  resolveResponse({
                    status: response.statusCode ?? null,
                    body,
                  });
                });
              },
            );
            request.once('error', () => {
              clients.push({
                sequence: current,
                sentAtEpochMs: sent,
                headerAtEpochMs: headers,
                endedAtEpochMs: Date.now(),
                route: '/v1/case',
                actor: 'M:A',
                sweepPhase: 'memberAGets',
                method: 'GET',
              });
              resolveResponse({ status: null, body: '' });
            });
            request.end();
            if (abortBoundary) {
              const wait = () => {
                const ready =
                  abortBoundary === 'before'
                    ? Boolean(guardRelease)
                    : handlerCalls > callsBefore;
                if (ready) {
                  request.destroy();
                } else setImmediate(wait);
              };
              setImmediate(wait);
            }
          },
        );
      try {
        expect((await send('/success')).status).toBe(200);
        expect((await send('/typed')).status).toBe(400);
        expect((await send('/timeout')).status).toBe(408);
        expect((await send('/multi')).body).toBe('second');
        expect((await send('/repeat')).status).toBe(200);
        expect(handlerCalls).toBe(6);
        guardMode = 'deferred';
        const deferred = send('/deferred');
        while (!guardRelease)
          await new Promise<void>((resolveWait) => setImmediate(resolveWait));
        if (enabled)
          expect(
            events.some(
              (event) => event.kind === 'pipelineEnter' && event.sequence === 6,
            ),
          ).toBe(false);
        guardRelease();
        await deferred;
        guardRelease = undefined;
        expect(handlerCalls).toBe(7);
        await send('/pending', 'after');
        await new Promise((resolveWait) => setTimeout(resolveWait, 60));
        guardMode = 'before';
        await send('/before', 'before');
        expect(handlerCalls).toBe(8);
        await new Promise<void>((resolveWait) => setImmediate(resolveWait));
        instance.stop();
        if (enabled) {
          const evidence = joinCausalEvidence(
            { requests: clients, inventoryTemplates: ['/v1/case'] },
            events,
            {
              final: true,
              stopped: true,
              actors: ['M:A'],
              phases: ['memberAGets'],
            },
          );
          expect(evidence.quality).toBe('complete');
          expect(evidence.conservation.clientAttempts).toBe(9);
          expect(evidence.conservation.classes.finished408).toBe(1);
          expect(evidence.conservation.classes.closedBeforePipeline).toBe(1);
          expect(evidence.conservation.classes.closedAfterPipeline).toBe(1);
          expect(
            evidence.requestGroups.reduce(
              (sum: number, g: { repeatedPipelineAttempts: number }) =>
                sum + g.repeatedPipelineAttempts,
              0,
            ),
          ).toBe(1);
          expect(
            events.filter(
              (event) => event.kind === 'pipelineNext' && event.sequence === 4,
            ),
          ).toHaveLength(2);
          expect(
            events.filter(
              (event) =>
                event.kind === 'pipelineFinalize' && event.sequence === 3,
            ),
          ).toHaveLength(1);
        } else
          expect(
            events.filter((event) => event.kind === 'ingress'),
          ).toHaveLength(0);
      } finally {
        server.closeAllConnections();
        await app.close();
        instance.stop();
      }
    }
  }, 15000);
});
