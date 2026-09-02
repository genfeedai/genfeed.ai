import { ArticlesOperationsController } from '@api/collections/articles/controllers/operations/articles-operations.controller';
import { ImagesOperationsController } from '@api/collections/images/controllers/operations/images-operations.controller';
import { ImagesReframeController } from '@api/collections/images/controllers/transformations/images-reframe.controller';
import { ImagesUpscaleController } from '@api/collections/images/controllers/transformations/images-upscale.controller';
import { MusicsOperationsController } from '@api/collections/musics/controllers/musics-operations.controller';
import { AvatarVideoController } from '@api/collections/videos/controllers/avatar-video.controller';
import { VideosController } from '@api/collections/videos/controllers/videos.controller';
import { VoicesOperationsController } from '@api/collections/voices/controllers/voices-operations.controller';
import {
  CREDITS_DEFER_MODEL_RESOLUTION_KEY,
  CREDITS_KEY,
} from '@api/helpers/decorators/credits/credits.decorator';
import { ROLES_KEY } from '@api/helpers/decorators/roles/roles.decorator';
import { ValidateModel } from '@api/helpers/guards/models/models.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import type { AgentEndpoint } from '@api/services/agent-generation-gateway/agent-endpoint.interface';
import { AgentEndpointInvoker } from '@api/services/agent-generation-gateway/agent-endpoint-invoker.service';
import { AgentGenerationGatewayService } from '@api/services/agent-generation-gateway/agent-generation-gateway.service';
import type { MemberRole } from '@genfeedai/enums';
import { testId } from '@helpers/testing/test-id.helper';
import type { Type } from '@nestjs/common';
import {
  GUARDS_METADATA,
  INTERCEPTORS_METADATA,
  PARAMTYPES_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/internal';
import { Reflector } from '@nestjs/core';
import type { AgentGenerationResourceInput } from '@server/services/agent-orchestrator/gateway/agent-generation-gateway.interface';

/**
 * Enforces the invariant stated on `AgentGenerationGatewayService` itself:
 * every descriptor mirrors one controller method's decorators one-for-one.
 * Reads both sides through the same `Reflect`/`Reflector` calls Nest's router
 * uses at boot (`ContextUtils.reflectCallbackMetadata`,
 * `ContextUtils.reflectCallbackParamtypes`, `ModelsGuard.canActivate`), so a
 * descriptor and its controller can drift only if the reflection itself lies.
 */

type ControllerClass = Type<object>;

interface RouteFixture {
  bodyParamIndex: number;
  controller: ControllerClass;
  methodName: string;
}

const GLOBAL_PREFIX = 'v1';

/** Every route `AgentGenerationGatewayService`'s doc comments claim to mirror, in the same order the service declares its methods. */
const ROUTES: Record<string, RouteFixture> = {
  generateArticle: {
    bodyParamIndex: 1,
    controller: ArticlesOperationsController,
    methodName: 'generateArticles',
  },
  generateAvatarVideo: {
    bodyParamIndex: 2,
    controller: AvatarVideoController,
    methodName: 'createAvatarVideo',
  },
  generateImage: {
    bodyParamIndex: 1,
    controller: ImagesOperationsController,
    methodName: 'create',
  },
  generateMusic: {
    bodyParamIndex: 2,
    controller: MusicsOperationsController,
    methodName: 'create',
  },
  generateVideo: {
    bodyParamIndex: 1,
    controller: VideosController,
    methodName: 'create',
  },
  generateVoice: {
    bodyParamIndex: 2,
    controller: VoicesOperationsController,
    methodName: 'generate',
  },
  reframeImage: {
    bodyParamIndex: 3,
    controller: ImagesReframeController,
    methodName: 'reframeImage',
  },
  upscaleImage: {
    bodyParamIndex: 3,
    controller: ImagesUpscaleController,
    methodName: 'upscaleImage',
  },
};

const ROUTE_ENTRIES = Object.entries(ROUTES);

const ORGANIZATION_ID = testId('org');
const USER_ID = testId('user');

function getHandler(
  controller: ControllerClass,
  methodName: string,
): (...args: unknown[]) => unknown {
  const handler = (controller.prototype as Record<string, unknown>)[methodName];
  if (typeof handler !== 'function') {
    throw new Error(`${controller.name}.${methodName} is not a method`);
  }
  return handler as (...args: unknown[]) => unknown;
}

function getClassGuards(controller: ControllerClass): unknown[] {
  return Reflect.getMetadata(GUARDS_METADATA, controller) ?? [];
}

function getClassInterceptors(controller: ControllerClass): unknown[] {
  return Reflect.getMetadata(INTERCEPTORS_METADATA, controller) ?? [];
}

function getMethodInterceptors(
  handler: (...args: unknown[]) => unknown,
): unknown[] {
  return Reflect.getMetadata(INTERCEPTORS_METADATA, handler) ?? [];
}

/**
 * Resolves the `@Body()` DTO class the same way Nest's router does: find the
 * route-args entry whose paramtype is `BODY`, then read that parameter index
 * out of `design:paramtypes`. `ROUTE_ARGS_METADATA` is stored on the class
 * (mirrors `ContextUtils.reflectCallbackMetadata`); `design:paramtypes` is
 * stored on the prototype (mirrors `ContextUtils.reflectCallbackParamtypes`).
 */
function resolveBodyDto(
  controller: ControllerClass,
  methodName: string,
): { bodyIndex: number; dto: unknown } {
  const routeArgs: Record<string, { index: number }> =
    Reflect.getMetadata(ROUTE_ARGS_METADATA, controller, methodName) ?? {};
  const bodyKey = Object.keys(routeArgs).find((key) =>
    key.startsWith(`${RouteParamtypes.BODY}:`),
  );
  if (!bodyKey) {
    throw new Error(
      `${controller.name}.${methodName} has no @Body() parameter`,
    );
  }
  const bodyIndex = routeArgs[bodyKey].index;

  const paramTypes: unknown[] =
    Reflect.getMetadata(
      PARAMTYPES_METADATA,
      controller.prototype,
      methodName,
    ) ?? [];

  return { bodyIndex, dto: paramTypes[bodyIndex] };
}

function normalizeRoles(
  roles: (string | MemberRole)[] | undefined,
): (string | MemberRole)[] {
  return roles ?? [];
}

function joinPath(...segments: string[]): string {
  const cleaned = segments
    .map((segment) => segment.replace(/^\/+|\/+$/g, ''))
    .filter((segment) => segment.length > 0);
  return `/${cleaned.join('/')}`;
}

/**
 * Builds the route pattern Nest itself would register for a controller
 * method from `@Controller(prefix)` + `@Post(path)` `PATH_METADATA`, with the
 * global `v1` prefix `main.ts` applies. This is derived from the decorators,
 * not from the descriptor under test, so a typo'd `originalUrl` has nothing
 * real to match against.
 */
function controllerRoutePattern(
  controller: ControllerClass,
  methodName: string,
): RegExp {
  const controllerPath: string =
    Reflect.getMetadata(PATH_METADATA, controller) ?? '';
  const handler = getHandler(controller, methodName);
  const methodPath: string = Reflect.getMetadata(PATH_METADATA, handler) ?? '';
  const pattern = joinPath(GLOBAL_PREFIX, controllerPath, methodPath).replace(
    /:[^/]+/g,
    '[^/]+',
  );
  return new RegExp(`^${pattern}$`);
}

describe('AgentGenerationGatewayService decorator parity', () => {
  let service: AgentGenerationGatewayService;
  let invoke: ReturnType<typeof vi.fn>;
  let capturedInOrder: AgentEndpoint<object, unknown>[];

  beforeEach(() => {
    capturedInOrder = [];
    invoke = vi.fn((endpoint: AgentEndpoint<object, unknown>) => {
      capturedInOrder.push(endpoint);
      return Promise.resolve({});
    });

    service = new AgentGenerationGatewayService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { invoke } as unknown as AgentEndpointInvoker,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  /** Calls all 8 gateway methods in the exact order `ROUTES` declares them. */
  async function runAllRoutes(): Promise<
    Map<string, AgentEndpoint<object, unknown>>
  > {
    const principal = { organizationId: ORGANIZATION_ID, userId: USER_ID };
    const resourceInput: AgentGenerationResourceInput = {
      body: {},
      principal,
      resourceId: testId('image'),
    };

    await service.generateArticle({ body: {}, principal });
    await service.generateAvatarVideo({ body: {}, principal });
    await service.generateImage({ body: {}, principal });
    await service.generateMusic({ body: {}, principal });
    await service.generateVideo({ body: {}, principal });
    await service.generateVoice({ body: {}, principal });
    await service.reframeImage(resourceInput);
    await service.upscaleImage(resourceInput);

    return new Map(
      ROUTE_ENTRIES.map(([gatewayMethod], index) => [
        gatewayMethod,
        capturedInOrder[index],
      ]),
    );
  }

  it('captures a descriptor for all 8 gateway methods', async () => {
    const captured = await runAllRoutes();
    expect(invoke).toHaveBeenCalledTimes(ROUTE_ENTRIES.length);
    for (const [gatewayMethod] of ROUTE_ENTRIES) {
      expect(captured.get(gatewayMethod)).toBeDefined();
    }
  });

  describe.each(ROUTE_ENTRIES)(
    '%s',
    (gatewayMethod, { controller, methodName, bodyParamIndex }) => {
      let descriptor: AgentEndpoint<object, unknown>;
      let handler: (...args: unknown[]) => unknown;

      beforeEach(async () => {
        const captured = await runAllRoutes();
        const found = captured.get(gatewayMethod);
        if (!found) {
          throw new Error(`No descriptor captured for ${gatewayMethod}`);
        }
        descriptor = found;
        handler = getHandler(controller, methodName);
      });

      it(`mirrors ${controller.name}.${methodName}'s @Credits config`, () => {
        const controllerCredits = Reflect.getMetadata(CREDITS_KEY, handler);
        expect(descriptor.creditsConfig).toEqual(controllerCredits);
      });

      it('applies CreditsInterceptor iff the controller does', () => {
        const hasInterceptor = [
          ...getClassInterceptors(controller),
          ...getMethodInterceptors(handler),
        ].includes(CreditsInterceptor);
        expect(descriptor.hasCreditsInterceptor).toBe(hasInterceptor);
      });

      it('applies RolesGuard on the class iff the controller does', () => {
        const hasRolesGuard = getClassGuards(controller).includes(RolesGuard);
        expect(descriptor.hasRolesGuard).toBe(hasRolesGuard);
      });

      it('requires the same roles the handler declares', () => {
        const controllerRoles = Reflect.getMetadata(ROLES_KEY, handler);
        expect(normalizeRoles(descriptor.requiredRoles)).toEqual(
          normalizeRoles(controllerRoles),
        );
      });

      it('validates the body against the same DTO class the controller binds', () => {
        const { bodyIndex, dto } = resolveBodyDto(controller, methodName);
        expect(bodyIndex).toBe(bodyParamIndex);
        expect(descriptor.dto).toBe(dto);
      });

      it('defers credits until model resolution iff the controller does', () => {
        const controllerDefers =
          Reflect.getMetadata(CREDITS_DEFER_MODEL_RESOLUTION_KEY, handler) ===
          true;
        expect(descriptor.shouldDeferCreditsUntilModelResolution === true).toBe(
          controllerDefers,
        );
      });

      it('validates the same model category the controller does', () => {
        const controllerValidation = new Reflector().get(
          ValidateModel,
          handler,
        );
        expect(descriptor.modelValidation).toEqual(controllerValidation);
      });
    },
  );

  it('never reserves credits on a descriptor with no settlement path', async () => {
    const captured = await runAllRoutes();
    for (const [gatewayMethod, descriptor] of captured) {
      expect(
        Boolean(descriptor.creditsConfig) && !descriptor.hasCreditsInterceptor,
        `${gatewayMethod} reserves credits but has no interceptor to settle or release them`,
      ).toBe(false);
    }
  });

  it('resolves every descriptor originalUrl to a real controller route', async () => {
    const captured = await runAllRoutes();
    for (const [gatewayMethod, { controller, methodName }] of ROUTE_ENTRIES) {
      const descriptor = captured.get(gatewayMethod);
      if (!descriptor) {
        throw new Error(`No descriptor captured for ${gatewayMethod}`);
      }
      const pattern = controllerRoutePattern(controller, methodName);
      expect(
        pattern.test(descriptor.originalUrl),
        `${gatewayMethod} originalUrl "${descriptor.originalUrl}" does not match ${controller.name}.${methodName}'s route ${pattern}`,
      ).toBe(true);
    }
  });
});
